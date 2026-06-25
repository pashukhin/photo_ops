import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createDb } from '../db/client';
import { photoAssets, photoVariants, processingJobs } from '../db/schema';
import { CreateUploadIntentInput, ListPhotosParams, PhotoAssetRecord, PhotoVariantRecord, ProcessingJobRecord } from './photo.types';
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

  async list(_params: ListPhotosParams): Promise<{ rows: PhotoAssetRecord[]; totalCount: number }> {
    // GREEN obligation (session 011): build one filtered query scoped to
    // _params.userId — status IN (_params.statusFilter) when non-empty, filename
    // ILIKE %_params.filenameQuery% when non-empty — ORDER BY the column mapped
    // from _params.sortBy in _params.sortDir, then LIMIT _params.pageSize OFFSET
    // (_params.page - 1) * _params.pageSize; plus a COUNT(*) over the same filter
    // (ignoring pagination) for totalCount. SQL correctness is verified by the
    // live UI smoke + manual e2e (no in-process DB in this session; see 4vg).
    throw new Error('NotImplemented: PhotoRepository.list'); // GREEN is the implementer's job
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

  async applyAttributes(photoId: string, attrs: { width: number | null; height: number | null; takenAtLocal: string | null; takenAtUtc: Date | null; takenAtTzSource: string | null; cameraMake: string | null; cameraModel: string | null; orientation: number | null; lat: number | null; lon: number | null; metadataJson: unknown }): Promise<void> {
    await this.db
      .update(photoAssets)
      .set({ ...attrs, updatedAt: new Date() })
      .where(eq(photoAssets.id, photoId));
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
