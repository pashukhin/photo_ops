import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createDb } from '../db/client';
import { photoAssets } from '../db/schema';
import { CreateUploadIntentInput, PhotoAssetRecord } from './photo.types';
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
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        status: 'uploading'
      })
      .returning();
    return this.toRecord(created);
  }

  async markUploaded(photoId: string): Promise<PhotoAssetRecord> {
    const [updated] = await this.db
      .update(photoAssets)
      .set({ status: 'uploaded', updatedAt: new Date() })
      .where(eq(photoAssets.id, photoId))
      .returning();
    if (!updated) {
      throw new Error('photo not found');
    }
    return this.toRecord(updated);
  }

  async findById(photoId: string): Promise<PhotoAssetRecord | null> {
    const [row] = await this.db.select().from(photoAssets).where(eq(photoAssets.id, photoId)).limit(1);
    return row ? this.toRecord(row) : null;
  }

  async list(limit: number): Promise<PhotoAssetRecord[]> {
    const rows = await this.db.select().from(photoAssets).orderBy(desc(photoAssets.createdAt)).limit(limit);
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: typeof photoAssets.$inferSelect): PhotoAssetRecord {
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      objectKey: row.objectKey,
      status: row.status as PhotoAssetRecord['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
