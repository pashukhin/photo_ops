import { Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import {
  ClusterResultTree,
  ClusterTreeNode,
  CreatePostRow,
  PostPatch,
  PostRecord,
  PostSummaryRecord
} from './post.types';

// Depth-first search for a node by id within a result tree.
function findNode(node: ClusterTreeNode | null, id: string): ClusterTreeNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Photos of a subtree in tree order: a node's own items, then its children
// (pre-order). A photo enters at exactly one node, so no dedup is needed.
function collectPhotos(node: ClusterTreeNode): string[] {
  const acc = node.items.map((item) => item.photoId);
  for (const child of node.children) {
    acc.push(...collectPhotos(child));
  }
  return acc;
}

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
  async createPostFromCluster(input: CreatePostFromClusterInput): Promise<PostRecord> {
    const tree = await this.clusters.getResult({ resultId: input.resultId, userId: input.userId });
    if (!tree) {
      throw new Error('cluster result not found');
    }
    // The tree is absent until the run is READY (cluster proto contract).
    if (!tree.root) {
      throw new Error('cluster result not ready');
    }
    const node = findNode(tree.root, input.nodeId);
    if (!node) {
      throw new Error('cluster node not found');
    }
    // Node-selection guard (4o2 #3). Kinds: 1=ROOT, 2=INTERNAL, 3=LEAF,
    // 4=NOT_CLUSTERABLE, 5=SEGMENT. ROOT snapshots the whole tree incl. the
    // not_clusterable bucket; NOT_CLUSTERABLE is the excluded-photos bucket —
    // neither is a story. An empty subtree would yield a silently-empty post.
    if (node.kind === 1 || node.kind === 4) {
      throw new Error('node not selectable');
    }
    const photoIds = collectPhotos(node);
    if (photoIds.length === 0) {
      throw new Error('empty node');
    }
    const row: CreatePostRow = {
      id: uuidv7(),
      userId: input.userId,
      sourceClusterId: input.nodeId,
      sourceResultId: input.resultId,
      title: input.title,
      body: '',
      status: 'draft',
      visibility: 'private',
      slug: null,
      // The cluster carries no place (ADR-0005) — location_label is not seeded.
      locationLabel: '',
      dateFrom: node.dateFrom ? new Date(node.dateFrom) : null,
      dateTo: node.dateTo ? new Date(node.dateTo) : null,
      mapEnabled: false,
      photos: photoIds.map((photoId, order) => ({ photoId, order, caption: '' }))
    };
    return this.repository.createPostWithPhotos(row);
  }

  // Owner-scoped read; throws 'post not found' when absent or not owned.
  async getPost(userId: string, postId: string): Promise<PostRecord> {
    const post = await this.repository.findByIdForUser(userId, postId);
    if (!post) {
      throw new Error('post not found');
    }
    return post;
  }

  listPosts(userId: string): Promise<PostSummaryRecord[]> {
    return this.repository.listForUser(userId);
  }

  // Owner-scoped update; throws 'post not found' when absent or not owned. When
  // `patch.photos` is present (replace-all), the new list must be a non-empty,
  // duplicate-free subset of the post's current membership (4o2 — no add via
  // replace-all, no cross-user photo injection); order is canonicalized by the
  // repository from list position.
  async updatePost(userId: string, postId: string, patch: PostPatch): Promise<PostRecord> {
    if (patch.photos !== undefined) {
      const current = await this.repository.findByIdForUser(userId, postId);
      if (!current) {
        throw new Error('post not found');
      }
      const ids = patch.photos.map((p) => p.photoId);
      const currentIds = new Set(current.photos.map((p) => p.photoId));
      const noDuplicates = new Set(ids).size === ids.length;
      const isSubset = ids.every((id) => currentIds.has(id));
      if (ids.length === 0 || !noDuplicates || !isSubset) {
        throw new Error('invalid photo membership');
      }
    }
    const post = await this.repository.updateForUser(userId, postId, patch);
    if (!post) {
      throw new Error('post not found');
    }
    return post;
  }
}
