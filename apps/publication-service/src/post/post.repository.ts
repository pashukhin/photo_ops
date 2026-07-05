import { Injectable } from '@nestjs/common';
import { createDb } from '../db/client';
import { PostRepositoryPort } from './post.service';
import { CreatePostRow, PostPatch, PostRecord, PostSummaryRecord } from './post.types';

// Drizzle/Postgres adapter for the Post aggregate. Excluded from unit coverage
// (IO adapter — exercised by the live smoke). GREEN fills these against the
// `posts` + `post_photos` tables, inserting the post and its photos in one
// transaction and scoping every read/update by user_id.
@Injectable()
export class PostRepository implements PostRepositoryPort {
  private readonly db = createDb();

  createPostWithPhotos(row: CreatePostRow): Promise<PostRecord> {
    return Promise.reject(new Error(`not implemented: createPostWithPhotos ${row.id} (db=${typeof this.db})`));
  }

  findByIdForUser(userId: string, postId: string): Promise<PostRecord | null> {
    return Promise.reject(new Error(`not implemented: findByIdForUser ${userId}/${postId}`));
  }

  listForUser(userId: string): Promise<PostSummaryRecord[]> {
    return Promise.reject(new Error(`not implemented: listForUser ${userId}`));
  }

  updateForUser(userId: string, postId: string, patch: PostPatch): Promise<PostRecord | null> {
    return Promise.reject(new Error(`not implemented: updateForUser ${userId}/${postId} ${JSON.stringify(patch)}`));
  }
}
