import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { uuidv7 } from 'uuidv7';
import { currentTraceparent } from '@photoops/observability';
import { MessagePublisher } from '../messaging/messaging.port';
import { CreateUploadIntentInput, ListPhotosParams, ListPhotosResult, PhotoAssetRecord, PhotoVariantRecord, PhotoVariantView, PhotoWithVariants, ProcessingJobRecord, ProcessingResultInput } from './photo.types';
import { encodeJob } from './processing.codec';

function parseMetadata(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  createProcessingJob(input: { photoId: string; userId: string; type: 'initial' | 'reprocess'; correlationId: string }): Promise<ProcessingJobRecord>;
  markProcessingForUser(userId: string, photoId: string): Promise<boolean>;
  finalizeJob(jobId: string, outcome: 'succeeded' | 'failed', errorMessage?: string): Promise<boolean>;
  upsertVariant(v: { photoId: string; variantType: 'thumbnail' | 'preview'; objectKey: string; width: number; height: number; sizeBytes: bigint; contentType: string }): Promise<void>;
  applyAttributes(photoId: string, attrs: { width: number | null; height: number | null; takenAtLocal: string | null; takenAtUtc: Date | null; takenAtTzSource: string | null; cameraMake: string | null; cameraModel: string | null; orientation: number | null; lat: number | null; lon: number | null; metadataJson: unknown }): Promise<void>;
  setStatus(photoId: string, status: 'ready' | 'failed' | 'processing'): Promise<void>;
  findByIdWithVariantsForUser(userId: string, photoId: string): Promise<{ photo: PhotoAssetRecord; variants: PhotoVariantRecord[] } | null>;
  listVariantsForPhotos(photoIds: string[]): Promise<PhotoVariantRecord[]>;
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
    private readonly logger: PinoLogger
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

    const uploaded = await this.repository.markUploadedForUser(userId, photoId);

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

  async getPhoto(userId: string, photoId: string): Promise<PhotoWithVariants | null> {
    const result = await this.repository.findByIdWithVariantsForUser(userId, photoId);
    if (!result) return null;
    const variants = await Promise.all(result.variants.map((v) => this.toVariantView(v)));
    return { photo: result.photo, variants };
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

    const photos = await Promise.all(
      rows.map(async (photo) => {
        const photoVariantRecords = variantsByPhotoId.get(photo.id) ?? [];
        const variants = await Promise.all(photoVariantRecords.map((v) => this.toVariantView(v)));
        return { photo, variants };
      })
    );

    return { photos, totalCount };
  }

  private async toVariantView(v: PhotoVariantRecord): Promise<PhotoVariantView> {
    const url = await this.storage.createPresignedGetUrl(v.objectKey);
    return { variantType: v.variantType, url, width: v.width, height: v.height };
  }

  async finalizeResult(result: ProcessingResultInput): Promise<void> {
    const applied = await this.repository.finalizeJob(result.jobId, result.outcome, result.errorMessage);
    if (!applied) return;

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
        metadataJson: parseMetadata(result.metadataJson)
      });

      await this.repository.setStatus(result.photoId, 'ready');
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
