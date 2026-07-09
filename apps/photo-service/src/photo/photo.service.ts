import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { uuidv7 } from 'uuidv7';
import { currentTraceparent } from '@photoops/observability';
import { MessagePublisher } from '../messaging/messaging.port';
import { CreateUploadIntentInput, GeoPlaceInput, ListPhotosParams, ListPhotosResult, LocationRecord, NormalizedPlace, PhotoAssetRecord, PhotoVariantRecord, PhotoVariantView, PhotoWithVariants, ProcessingJobRecord, ProcessingResultInput } from './photo.types';
import { encodeJob } from './processing.codec';
import { UsageEmitter } from './usage.emitter';

function parseMetadata(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Normalize a geocoded/manual place into the dedup tuple: trim + coalesce
// null/undefined to ''. NO lower-casing in 022 — all places are geocoded (casing
// consistent) and the display must stay human-readable ("Buenos Aires"); a
// case-insensitive lower() index is a 9q4.3 concern once manual entries collide.
export function normalizePlace(place: GeoPlaceInput): NormalizedPlace {
  const norm = (v: string | undefined): string => (v ?? '').trim();
  return {
    continent: norm(place.continent),
    country: norm(place.country),
    region: norm(place.region),
    city: norm(place.city),
    district: norm(place.district),
  };
}

// Logical destination name for the processing job flow (broker topology lives
// in the adapter, not here).
export const PROCESS_JOB_DESTINATION = 'photo.process';

const MAX_UPLOAD_BYTES = 25n * 1024n * 1024n;
const JPEG_CONTENT_TYPES = new Set(['image/jpeg', 'image/jpg']);

export interface PhotoRepositoryPort {
  createUploading(input: CreateUploadIntentInput): Promise<PhotoAssetRecord>;
  markUploadedForUser(userId: string, photoId: string): Promise<PhotoAssetRecord>;
  findByIdForUser(userId: string, photoId: string): Promise<PhotoAssetRecord | null>;
  // Returns the page of rows matching the filter/sort plus the total matching
  // count (ignoring pagination) for "page N of M". (session 011)
  list(params: ListPhotosParams): Promise<{ rows: PhotoAssetRecord[]; totalCount: number }>;
  // Ready photos for a user, for the internal ListPhotoSpacetime read-RPC (clustering).
  listReadyForUser(userId: string): Promise<PhotoAssetRecord[]>;
  createProcessingJob(input: { photoId: string; userId: string; type: 'initial' | 'reprocess'; correlationId: string }): Promise<ProcessingJobRecord>;
  markProcessingForUser(userId: string, photoId: string): Promise<boolean>;
  finalizeJob(jobId: string, outcome: 'succeeded' | 'failed', errorMessage?: string): Promise<boolean>;
  findJobById(jobId: string): Promise<ProcessingJobRecord | null>;
  upsertVariant(v: { photoId: string; variantType: 'thumbnail' | 'preview'; objectKey: string; width: number; height: number; sizeBytes: bigint; contentType: string }): Promise<void>;
  applyAttributes(photoId: string, attrs: { width: number | null; height: number | null; takenAtLocal: string | null; takenAtUtc: Date | null; takenAtTzSource: string | null; cameraMake: string | null; cameraModel: string | null; orientation: number | null; lat: number | null; lon: number | null; metadataJson: unknown; locationId?: string | null }): Promise<void>;
  setStatus(photoId: string, status: 'ready' | 'failed' | 'processing'): Promise<void>;
  // Owner-scoped manual location set/override (9q4.3): links location_id + writes the
  // captured point; returns whether a row matched (id AND user_id).
  setLocationForUser(userId: string, photoId: string, patch: { locationId: string; lat: number | null; lon: number | null }): Promise<boolean>;
  // Idempotent upsert of a deduped Location by the normalized place tuple; returns its id.
  upsertLocation(input: NormalizedPlace & { lat: number | null; lon: number | null; rawProviderData: unknown }): Promise<string>;
  // Batched lookup of locations by id, for composing the gallery place-tag.
  listLocationsByIds(ids: string[]): Promise<LocationRecord[]>;
  findByIdWithVariantsForUser(userId: string, photoId: string): Promise<{ photo: PhotoAssetRecord; variants: PhotoVariantRecord[] } | null>;
  listVariantsForPhotos(photoIds: string[]): Promise<PhotoVariantRecord[]>;
  // Owner-scoped batched variant lookup (session 019): variants of the owner's
  // photos among the requested ids, grouped by photo. Non-owned / unknown /
  // no-variant ids are simply absent.
  findVariantsByIdsForUser(userId: string, photoIds: string[]): Promise<{ photoId: string; variants: PhotoVariantRecord[] }[]>;
}

export interface ObjectStoragePort {
  createPresignedPutUrl(objectKey: string, contentType: string): Promise<{ uploadUrl: string; expiresAt: Date }>;
  objectExists(objectKey: string): Promise<boolean>;
  createPresignedGetUrl(objectKey: string, expiresIn?: number): Promise<string>;
}

@Injectable()
export class PhotoDomainService {
  constructor(
    private readonly repository: PhotoRepositoryPort,
    private readonly storage: ObjectStoragePort,
    private readonly publisher: MessagePublisher,
    private readonly logger: PinoLogger,
    private readonly usageEmitter: UsageEmitter
  ) {}

  async createUploadIntent(input: CreateUploadIntentInput) {
    if (!JPEG_CONTENT_TYPES.has(input.contentType)) {
      throw new Error('unsupported content type');
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error('file too large');
    }

    const photo = await this.repository.createUploading(input);
    const presigned = await this.storage.createPresignedPutUrl(photo.objectKey, photo.contentType);

    return {
      photoId: photo.id,
      objectKey: photo.objectKey,
      uploadUrl: presigned.uploadUrl,
      expiresAt: presigned.expiresAt
    };
  }

  async completeUpload(userId: string, photoId: string) {
    const photo = await this.repository.findByIdForUser(userId, photoId);
    if (!photo) {
      throw new Error('photo not found');
    }
    const objectExists = await this.storage.objectExists(photo.objectKey);
    if (!objectExists) {
      throw new Error('uploaded object not found');
    }

    // Idempotency: only a photo still in 'uploading' may transition to 'uploaded'
    // and kick off processing. A duplicate / retried / late CompleteUpload for a
    // photo that already progressed (uploaded/processing/ready/failed) is a no-op
    // returning current state. Without this guard, markUploadedForUser (unguarded)
    // would regress the status back to 'uploaded', re-arming the guarded
    // uploaded->processing transition and starting a SECOND billable processing run
    // (charge-once keys on jobId, not photoId, so the re-run double-bills).
    if (photo.status !== 'uploading') {
      return photo;
    }

    const uploaded = await this.repository.markUploadedForUser(userId, photoId);

    // Best-effort: emit usage for original storage. A publish failure must not
    // break the upload flow — log it and continue.
    try {
      await this.usageEmitter.emitOriginalStored({ photoId, userId, sizeBytes: photo.sizeBytes });
    } catch (err) {
      this.logger.warn({ msg: 'usage.emit.failed', event: 'original_stored', photo_id: photoId, err }, 'usage emit failed');
    }

    // Kick off async processing: move uploaded -> processing, and only if this
    // call won that guarded transition, record the run and publish the job.
    // This makes a duplicate/concurrent completeUpload a no-op rather than a
    // second billable run (charge-once at the publish side). The correlation id
    // is threaded to the worker and back via the result for end-to-end tracing.
    const transitioned = await this.repository.markProcessingForUser(userId, photoId);
    if (transitioned) {
      const correlationId = currentTraceparent() ?? uuidv7();
      const job = await this.repository.createProcessingJob({
        photoId,
        userId,
        type: 'initial',
        correlationId
      });
      await this.publisher.publish(PROCESS_JOB_DESTINATION, {
        body: encodeJob({
          jobId: job.id,
          photoId,
          userId,
          objectKey: uploaded.objectKey,
          type: 'initial',
          correlationId
        }),
        correlationId
      });
    }

    return { ...uploaded, status: 'processing' as const };
  }

  // Manual location set/override (9q4.3): normalize the place -> upsert the deduped
  // Location (source:manual) -> owner-scoped write of location_id + the captured point ->
  // compose the updated asset. Throws 'photo not found' (-> gRPC NOT_FOUND) when the
  // owner-scoped write matches no row (the IDOR guard).
  setPhotoLocation(userId: string, photoId: string, place: GeoPlaceInput, lat: number | null, lon: number | null): Promise<PhotoWithVariants> {
    // GREEN: normalize -> upsert(source:manual) -> owner-scoped write -> compose (getPhoto)
    return Promise.reject(new Error(`not implemented: setPhotoLocation ${userId}/${photoId} ${place.city ?? ''} ${lat},${lon}`));
  }

  async getPhoto(userId: string, photoId: string): Promise<PhotoWithVariants | null> {
    const result = await this.repository.findByIdWithVariantsForUser(userId, photoId);
    if (!result) return null;
    const variants = await Promise.all(result.variants.map((v) => this.toVariantView(v)));
    const location = result.photo.locationId
      ? (await this.repository.listLocationsByIds([result.photo.locationId]))[0] ?? null
      : null;
    return { photo: result.photo, variants, location };
  }

  async listPhotos(params: ListPhotosParams): Promise<ListPhotosResult> {
    const { rows, totalCount } = await this.repository.list(params);

    const photoIds = rows.map((r) => r.id);
    const allVariants = await this.repository.listVariantsForPhotos(photoIds);

    // Group variants by photoId for efficient lookup.
    const variantsByPhotoId = new Map<string, typeof allVariants>();
    for (const v of allVariants) {
      const existing = variantsByPhotoId.get(v.photoId);
      if (existing) {
        existing.push(v);
      } else {
        variantsByPhotoId.set(v.photoId, [v]);
      }
    }

    // Batched location compose (mirrors the variant compose): one listLocationsByIds
    // over the distinct location ids, then map back per photo.
    const locationIds = [...new Set(rows.map((r) => r.locationId).filter((id): id is string => id !== null))];
    const locationsById = new Map(
      locationIds.length > 0
        ? (await this.repository.listLocationsByIds(locationIds)).map((l) => [l.id, l] as const)
        : []
    );

    const photos = await Promise.all(
      rows.map(async (photo) => {
        const photoVariantRecords = variantsByPhotoId.get(photo.id) ?? [];
        const variants = await Promise.all(photoVariantRecords.map((v) => this.toVariantView(v)));
        const location = photo.locationId ? locationsById.get(photo.locationId) ?? null : null;
        return { photo, variants, location };
      })
    );

    return { photos, totalCount };
  }

  // Lean space-time + device attributes of the caller's `ready` photos, for the
  // internal ListPhotoSpacetime read-RPC consumed by cluster-worker.
  async listSpacetime(userId: string): Promise<PhotoAssetRecord[]> {
    return this.repository.listReadyForUser(userId);
  }

  // Batched owner-scoped variant resolution (session 019): each owned photo's
  // variant VIEWS (short-lived presigned GET urls — variants only, never
  // originals). Consumed by api-gateway's public post route to render a published
  // post's photos without a session. Non-owned / unknown ids are absent.
  async getVariantsByIds(
    userId: string,
    photoIds: string[]
  ): Promise<{ photoId: string; variants: PhotoVariantView[] }[]> {
    const grouped = await this.repository.findVariantsByIdsForUser(userId, photoIds);
    return Promise.all(
      grouped.map(async (g) => ({
        photoId: g.photoId,
        variants: await Promise.all(g.variants.map((v) => this.toVariantView(v)))
      }))
    );
  }

  private async toVariantView(v: PhotoVariantRecord): Promise<PhotoVariantView> {
    const url = await this.storage.createPresignedGetUrl(v.objectKey);
    return { variantType: v.variantType, url, width: v.width, height: v.height };
  }

  async finalizeResult(result: ProcessingResultInput): Promise<void> {
    await this.repository.finalizeJob(result.jobId, result.outcome, result.errorMessage);

    // Winner-gate (opm): the job's RECORDED terminal status — not this message's
    // outcome — decides which result wins. Fetched once and reused for the userId
    // below. A redelivery of the winner re-applies the idempotent terminal writes
    // (reaching 'ready'/'failed' even after a crash between finalizeJob and setStatus);
    // a losing opposite-outcome duplicate is a no-op (must not clobber the winner).
    // NB: this assumes ONE terminal job per photo (only 'initial' jobs today). If a
    // 'reprocess' second job is ever wired, strengthen the gate to "is this the photo's
    // current run" — else a stale old-job redelivery reverts newer output (photo_ops-4uj).
    const job = await this.repository.findJobById(result.jobId);
    if (!job || job.status !== result.outcome) return;

    if (result.outcome === 'succeeded') {
      for (const v of result.variants) {
        await this.repository.upsertVariant({
          photoId: result.photoId,
          variantType: v.variantType,
          objectKey: v.objectKey,
          width: v.width,
          height: v.height,
          sizeBytes: v.sizeBytes,
          contentType: v.contentType
        });
      }

      const a = result.attributes;

      // Reverse-geocoded place → a deduped Location + link. The representative
      // lat/lon come from the matched city record in raw_provider_data (GeoPlace
      // carries no lat/lon of its own). Absent place (no GPS / geocoder-down) leaves
      // location_id null and processing still reaches 'ready' (§3.4).
      let locationId: string | null = null;
      if (a?.place) {
        const raw = parseMetadata(a.place.rawProviderData ?? '') as { lat?: number; lon?: number } | null;
        locationId = await this.repository.upsertLocation({
          ...normalizePlace(a.place),
          lat: raw?.lat ?? null,
          lon: raw?.lon ?? null,
          rawProviderData: raw ?? null
        });
      }

      await this.repository.applyAttributes(result.photoId, {
        width: a?.width ?? null,
        height: a?.height ?? null,
        takenAtLocal: a?.takenAtLocal ?? null,
        takenAtUtc: a?.takenAtUtc ? new Date(a.takenAtUtc) : null,
        takenAtTzSource: a?.takenAtTzSource ?? null,
        cameraMake: a?.cameraMake ?? null,
        cameraModel: a?.cameraModel ?? null,
        orientation: a?.orientation ? a.orientation : null,
        lat: a?.lat ?? null,
        lon: a?.lon ?? null,
        metadataJson: parseMetadata(result.metadataJson),
        locationId
      });

      await this.repository.setStatus(result.photoId, 'ready');

      // Best-effort usage: always emit — charge-once is provided by the jobId-keyed
      // dedup in usage-service, so a redelivery re-emit is a no-op there; gating on
      // 'applied' would instead drop the charge on a redelivery. A publish failure
      // must not break finalize — log and continue. (job is non-null past the gate.)
      try {
        await this.usageEmitter.emitProcessingConsumption({ result, userId: job.userId });
      } catch (err) {
        this.logger.warn({ msg: 'usage.emit.failed', event: 'processing_consumption', job_id: result.jobId, err }, 'usage emit failed');
      }
    } else {
      await this.repository.setStatus(result.photoId, 'failed');
    }

    this.logger.info(
      {
        msg: 'processing.finalized',
        correlation_id: result.correlationId ?? null,
        job_id: result.jobId,
        photo_id: result.photoId,
        outcome: result.outcome
      },
      'processing.finalized'
    );
  }
}
