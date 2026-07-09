import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createDb } from '../db/client';
import { locations, photoAssets, photoVariants, processingJobs } from '../db/schema';
import { CreateUploadIntentInput, ListPhotosParams, LocationRecord, NormalizedPlace, PhotoAssetRecord, PhotoVariantRecord, ProcessingJobRecord } from './photo.types';
import { PhotoRepositoryPort } from './photo.service';

@Injectable()
export class PhotoRepository implements PhotoRepositoryPort {
  private readonly db = createDb();

  async createUploading(input: CreateUploadIntentInput): Promise<PhotoAssetRecord> {
    const id = uuidv7();
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `originals/${id}/${safeFilename}`;
    const [created] = await this.db
      .insert(photoAssets)
      .values({
        id,
        userId: input.userId,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        status: 'uploading'
      })
      .returning();
    return this.toRecord(created);
  }

  async markUploadedForUser(userId: string, photoId: string): Promise<PhotoAssetRecord> {
    const [updated] = await this.db
      .update(photoAssets)
      .set({ status: 'uploaded', updatedAt: new Date() })
      .where(and(eq(photoAssets.id, photoId), eq(photoAssets.userId, userId)))
      .returning();
    if (!updated) {
      throw new Error('photo not found');
    }
    return this.toRecord(updated);
  }

  async findByIdForUser(userId: string, photoId: string): Promise<PhotoAssetRecord | null> {
    const [row] = await this.db.select().from(photoAssets).where(and(eq(photoAssets.id, photoId), eq(photoAssets.userId, userId))).limit(1);
    return row ? this.toRecord(row) : null;
  }

  async list(params: ListPhotosParams): Promise<{ rows: PhotoAssetRecord[]; totalCount: number }> {
    const sortColumnMap = {
      created_at: photoAssets.createdAt,
      taken_at: photoAssets.takenAtUtc,
      filename: photoAssets.filename,
      size_bytes: photoAssets.sizeBytes
    } as const;

    const conditions = [eq(photoAssets.userId, params.userId)];

    if (params.statusFilter.length > 0) {
      conditions.push(inArray(photoAssets.status, params.statusFilter));
    }

    if (params.filenameQuery !== '') {
      // Escape ILIKE wildcards so a literal substring search does not treat a
      // user-typed % or _ as a pattern (\ is Postgres's default LIKE escape).
      const escaped = params.filenameQuery.replace(/[\\%_]/g, (c) => `\\${c}`);
      conditions.push(ilike(photoAssets.filename, `%${escaped}%`));
    }

    const where = and(...conditions);

    const sortCol = sortColumnMap[params.sortBy];
    const orderExpr = params.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const offset = (params.page - 1) * params.pageSize;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(photoAssets)
        .where(where)
        .orderBy(orderExpr)
        .limit(params.pageSize)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(photoAssets)
        .where(where)
    ]);

    const totalCount = Number(countResult[0]?.value ?? 0);
    return { rows: rows.map((r) => this.toRecord(r)), totalCount };
  }

  async listReadyForUser(userId: string): Promise<PhotoAssetRecord[]> {
    const rows = await this.db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.userId, userId), eq(photoAssets.status, 'ready')));
    return rows.map((r) => this.toRecord(r));
  }

  async createProcessingJob(input: { photoId: string; userId: string; type: 'initial' | 'reprocess'; correlationId: string }): Promise<ProcessingJobRecord> {
    const [created] = await this.db
      .insert(processingJobs)
      .values({
        id: uuidv7(),
        photoId: input.photoId,
        userId: input.userId,
        type: input.type,
        status: 'queued',
        correlationId: input.correlationId,
        startedAt: new Date()
      })
      .returning();
    return this.toJobRecord(created);
  }

  async markProcessingForUser(userId: string, photoId: string): Promise<boolean> {
    const rows = await this.db
      .update(photoAssets)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(and(eq(photoAssets.id, photoId), eq(photoAssets.userId, userId), eq(photoAssets.status, 'uploaded')))
      .returning({ id: photoAssets.id });
    return rows.length === 1;
  }

  async findJobById(jobId: string): Promise<ProcessingJobRecord | null> {
    const [row] = await this.db.select().from(processingJobs).where(eq(processingJobs.id, jobId)).limit(1);
    return row ? this.toJobRecord(row) : null;
  }

  async finalizeJob(jobId: string, outcome: 'succeeded' | 'failed', errorMessage?: string): Promise<boolean> {
    const rows = await this.db
      .update(processingJobs)
      .set({ status: outcome, errorMessage: errorMessage ?? null, finishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(processingJobs.id, jobId), eq(processingJobs.status, 'queued')))
      .returning({ id: processingJobs.id });
    return rows.length === 1;
  }

  async upsertVariant(v: { photoId: string; variantType: 'thumbnail' | 'preview'; objectKey: string; width: number; height: number; sizeBytes: bigint; contentType: string }): Promise<void> {
    await this.db
      .insert(photoVariants)
      .values({ id: uuidv7(), ...v })
      .onConflictDoUpdate({
        target: [photoVariants.photoId, photoVariants.variantType],
        set: {
          objectKey: v.objectKey,
          width: v.width,
          height: v.height,
          sizeBytes: v.sizeBytes,
          contentType: v.contentType,
          updatedAt: new Date()
        }
      });
  }

  async applyAttributes(photoId: string, attrs: { width: number | null; height: number | null; takenAtLocal: string | null; takenAtUtc: Date | null; takenAtTzSource: string | null; cameraMake: string | null; cameraModel: string | null; orientation: number | null; lat: number | null; lon: number | null; metadataJson: unknown; locationId?: string | null }): Promise<void> {
    await this.db
      .update(photoAssets)
      .set({ ...attrs, updatedAt: new Date() })
      .where(eq(photoAssets.id, photoId));
  }

  // Idempotent upsert by the normalized place tuple. ON CONFLICT DO UPDATE (a no-op
  // self-assign) so RETURNING yields the existing row's id on a dedup hit; DO NOTHING
  // would return no row. Concurrency-safe under same-tuple races.
  async upsertLocation(input: NormalizedPlace & { lat: number | null; lon: number | null; rawProviderData: unknown }): Promise<string> {
    const [row] = await this.db
      .insert(locations)
      .values({
        id: uuidv7(),
        continent: input.continent,
        country: input.country,
        region: input.region,
        city: input.city,
        district: input.district,
        lat: input.lat,
        lon: input.lon,
        rawProviderData: input.rawProviderData
      })
      .onConflictDoUpdate({
        target: [locations.continent, locations.country, locations.region, locations.city, locations.district],
        set: { continent: input.continent }
      })
      .returning({ id: locations.id });
    return row.id;
  }

  async listLocationsByIds(ids: string[]): Promise<LocationRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(locations).where(inArray(locations.id, ids));
    return rows.map((r) => ({
      id: r.id,
      continent: r.continent,
      country: r.country,
      region: r.region,
      city: r.city,
      district: r.district,
      lat: r.lat,
      lon: r.lon
    }));
  }

  setLocationForUser(userId: string, photoId: string, patch: { locationId: string; lat: number | null; lon: number | null }): Promise<boolean> {
    // GREEN: UPDATE photo_assets SET location_id/lat/lon WHERE id AND user_id -> rowCount>0
    return Promise.reject(new Error(`not implemented: setLocationForUser ${userId}/${photoId}/${patch.locationId}`));
  }

  async setStatus(photoId: string, status: 'ready' | 'failed' | 'processing'): Promise<void> {
    await this.db
      .update(photoAssets)
      .set({ status, updatedAt: new Date() })
      .where(eq(photoAssets.id, photoId));
  }

  async findByIdWithVariantsForUser(userId: string, photoId: string): Promise<{ photo: PhotoAssetRecord; variants: PhotoVariantRecord[] } | null> {
    const [row] = await this.db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.id, photoId), eq(photoAssets.userId, userId)))
      .limit(1);
    if (!row) return null;
    const variantRows = await this.db
      .select()
      .from(photoVariants)
      .where(eq(photoVariants.photoId, photoId));
    return { photo: this.toRecord(row), variants: variantRows.map((v) => this.toVariantRecord(v)) };
  }

  async listVariantsForPhotos(photoIds: string[]): Promise<PhotoVariantRecord[]> {
    if (photoIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(photoVariants)
      .where(inArray(photoVariants.photoId, photoIds));
    return rows.map((v) => this.toVariantRecord(v));
  }

  // Owner-scoped batched variant lookup (session 019). Owner scope is enforced
  // here: only photos owned by userId among the requested ids are considered,
  // then their variants are grouped by photo. Non-owned / unknown / no-variant
  // ids simply do not appear in the result.
  async findVariantsByIdsForUser(
    userId: string,
    photoIds: string[]
  ): Promise<{ photoId: string; variants: PhotoVariantRecord[] }[]> {
    if (photoIds.length === 0) return [];
    const ownedRows = await this.db
      .select({ id: photoAssets.id })
      .from(photoAssets)
      .where(and(eq(photoAssets.userId, userId), inArray(photoAssets.id, photoIds)));
    const ownedIds = ownedRows.map((r) => r.id);
    if (ownedIds.length === 0) return [];
    const variantRows = await this.db
      .select()
      .from(photoVariants)
      .where(inArray(photoVariants.photoId, ownedIds));
    const byPhoto = new Map<string, PhotoVariantRecord[]>();
    for (const row of variantRows) {
      const rec = this.toVariantRecord(row);
      const existing = byPhoto.get(rec.photoId);
      if (existing) existing.push(rec);
      else byPhoto.set(rec.photoId, [rec]);
    }
    return ownedIds
      .filter((id) => byPhoto.has(id))
      .map((id) => ({ photoId: id, variants: byPhoto.get(id) as PhotoVariantRecord[] }));
  }

  private toRecord(row: typeof photoAssets.$inferSelect): PhotoAssetRecord {
    return {
      id: row.id,
      userId: row.userId,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      objectKey: row.objectKey,
      status: row.status as PhotoAssetRecord['status'],
      width: row.width,
      height: row.height,
      takenAtLocal: row.takenAtLocal,
      takenAtUtc: row.takenAtUtc,
      takenAtTzSource: row.takenAtTzSource,
      cameraMake: row.cameraMake,
      cameraModel: row.cameraModel,
      orientation: row.orientation,
      lat: row.lat,
      lon: row.lon,
      metadataJson: row.metadataJson,
      locationId: row.locationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private toVariantRecord(row: typeof photoVariants.$inferSelect): PhotoVariantRecord {
    return {
      id: row.id,
      photoId: row.photoId,
      variantType: row.variantType as PhotoVariantRecord['variantType'],
      objectKey: row.objectKey,
      width: row.width,
      height: row.height,
      sizeBytes: row.sizeBytes,
      contentType: row.contentType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private toJobRecord(row: typeof processingJobs.$inferSelect): ProcessingJobRecord {
    return {
      id: row.id,
      photoId: row.photoId,
      userId: row.userId,
      type: row.type as ProcessingJobRecord['type'],
      status: row.status as ProcessingJobRecord['status'],
      correlationId: row.correlationId,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
