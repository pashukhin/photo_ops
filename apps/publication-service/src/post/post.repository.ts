import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { postPhotos, posts } from '../db/schema';
import { PostRepositoryPort } from './post.service';
import {
  CreatePostRow,
  PostPatch,
  PostPhotoRecord,
  PostRecord,
  PostStatus,
  PostSummaryRecord,
  PostVisibility
} from './post.types';

// Drizzle/Postgres adapter for the Post aggregate. Excluded from unit coverage
// (IO adapter — exercised by the live smoke). Every read/update is scoped by
// user_id; a post + its photos are written in one transaction.
@Injectable()
export class PostRepository implements PostRepositoryPort {
  private readonly db = createDb();

  async createPostWithPhotos(row: CreatePostRow): Promise<PostRecord> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(posts)
        .values({
          id: row.id,
          userId: row.userId,
          sourceClusterId: row.sourceClusterId,
          sourceResultId: row.sourceResultId,
          title: row.title,
          body: row.body,
          status: row.status,
          visibility: row.visibility,
          slug: row.slug,
          locationLabel: row.locationLabel,
          dateFrom: row.dateFrom,
          dateTo: row.dateTo,
          mapEnabled: row.mapEnabled
        })
        .returning();
      if (row.photos.length > 0) {
        await tx.insert(postPhotos).values(
          row.photos.map((photo) => ({
            postId: row.id,
            photoId: photo.photoId,
            order: photo.order,
            caption: photo.caption
          }))
        );
      }
      return this.toRecord(created, row.photos);
    });
  }

  async findByIdForUser(userId: string, postId: string): Promise<PostRecord | null> {
    const [row] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .limit(1);
    if (!row) {
      return null;
    }
    return this.toRecord(row, await this.photosFor(postId));
  }

  async listForUser(userId: string): Promise<PostSummaryRecord[]> {
    const rows = await this.db
      .select({
        id: posts.id,
        title: posts.title,
        status: posts.status,
        visibility: posts.visibility,
        dateFrom: posts.dateFrom,
        dateTo: posts.dateTo,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        photoCount: count(postPhotos.photoId)
      })
      .from(posts)
      .leftJoin(postPhotos, eq(postPhotos.postId, posts.id))
      .where(eq(posts.userId, userId))
      .groupBy(posts.id)
      .orderBy(desc(posts.createdAt));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as PostStatus,
      visibility: row.visibility as PostVisibility,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      photoCount: Number(row.photoCount),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async updateForUser(userId: string, postId: string, patch: PostPatch): Promise<PostRecord | null> {
    const set: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (patch.locationLabel !== undefined) set.locationLabel = patch.locationLabel;
    if (patch.mapEnabled !== undefined) set.mapEnabled = patch.mapEnabled;
    if (patch.dateFrom !== undefined) set.dateFrom = patch.dateFrom;
    if (patch.dateTo !== undefined) set.dateTo = patch.dateTo;

    const [updated] = await this.db
      .update(posts)
      .set(set)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .returning();
    if (!updated) {
      return null;
    }
    return this.toRecord(updated, await this.photosFor(postId));
  }

  private async photosFor(postId: string): Promise<PostPhotoRecord[]> {
    const rows = await this.db
      .select()
      .from(postPhotos)
      .where(eq(postPhotos.postId, postId))
      .orderBy(asc(postPhotos.order));
    return rows.map((row) => ({ photoId: row.photoId, order: row.order, caption: row.caption }));
  }

  private toRecord(row: typeof posts.$inferSelect, photos: PostPhotoRecord[]): PostRecord {
    return {
      id: row.id,
      userId: row.userId,
      sourceClusterId: row.sourceClusterId,
      sourceResultId: row.sourceResultId,
      title: row.title,
      body: row.body,
      status: row.status as PostStatus,
      visibility: row.visibility as PostVisibility,
      slug: row.slug,
      locationLabel: row.locationLabel,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      mapEnabled: row.mapEnabled,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      photos
    };
  }
}
