import { Injectable } from '@nestjs/common';
import {
  ClusterResultTree,
  CreatePostRow,
  PostPatch,
  PostRecord,
  PostSummaryRecord
} from './post.types';

// Persistence port — the repository adapter (Drizzle/Postgres) implements this.
export interface PostRepositoryPort {
  createPostWithPhotos(row: CreatePostRow): Promise<PostRecord>;
  findByIdForUser(userId: string, postId: string): Promise<PostRecord | null>;
  listForUser(userId: string): Promise<PostSummaryRecord[]>;
  updateForUser(userId: string, postId: string, patch: PostPatch): Promise<PostRecord | null>;
}

// Cluster-service read port — the proto-loader gRPC adapter implements this.
export interface ClusterReaderPort {
  getResult(input: { resultId: string; userId: string }): Promise<ClusterResultTree | null>;
}

export interface CreatePostFromClusterInput {
  userId: string;
  resultId: string;
  nodeId: string;
  title: string;
}

@Injectable()
export class PostDomainService {
  constructor(
    private readonly repository: PostRepositoryPort,
    private readonly clusters: ClusterReaderPort
  ) {}

  // Reads the clustering result (owner-scoped), locates the node, snapshots its
  // subtree photos in tree order into a new draft post, seeding date_from/date_to
  // from the node. Throws 'cluster result not found' / 'cluster node not found'.
  createPostFromCluster(input: CreatePostFromClusterInput): Promise<PostRecord> {
    return Promise.reject(new Error(`not implemented: createPostFromCluster ${input.resultId}/${input.nodeId}`));
  }

  // Owner-scoped read; throws 'post not found' when absent or not owned.
  getPost(userId: string, postId: string): Promise<PostRecord> {
    return Promise.reject(new Error(`not implemented: getPost ${userId}/${postId}`));
  }

  listPosts(userId: string): Promise<PostSummaryRecord[]> {
    return Promise.reject(new Error(`not implemented: listPosts ${userId}`));
  }

  // Owner-scoped scalar update; throws 'post not found' when absent or not owned.
  updatePost(userId: string, postId: string, patch: PostPatch): Promise<PostRecord> {
    return Promise.reject(new Error(`not implemented: updatePost ${userId}/${postId} ${JSON.stringify(patch)}`));
  }
}
