// Domain types for the Post aggregate. Cross-service refs (user_id, photo_id,
// source_cluster_id, source_result_id) are UUID v7 with no cross-service FK.

export type PostStatus = 'draft' | 'published' | 'unpublished';
export type PostVisibility = 'private' | 'unlisted' | 'public';

export interface PostPhotoRecord {
  photoId: string;
  order: number;
  caption: string;
}

export interface PostRecord {
  id: string;
  userId: string;
  sourceClusterId: string;
  sourceResultId: string;
  title: string;
  body: string;
  status: PostStatus;
  visibility: PostVisibility;
  slug: string | null;
  locationLabel: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  mapEnabled: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  photos: PostPhotoRecord[];
}

export interface PostSummaryRecord {
  id: string;
  title: string;
  status: PostStatus;
  visibility: PostVisibility;
  dateFrom: Date | null;
  dateTo: Date | null;
  photoCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// The full row the service hands the repository to insert (post + its photos in
// one unit). status/visibility/body/slug/locationLabel/mapEnabled are seeded by
// the service so the seeding is domain logic (testable), not a DB default.
export interface CreatePostRow {
  id: string;
  userId: string;
  sourceClusterId: string;
  sourceResultId: string;
  title: string;
  body: string;
  status: PostStatus;
  visibility: PostVisibility;
  slug: string | null;
  locationLabel: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  mapEnabled: boolean;
  photos: PostPhotoRecord[];
}

// Partial scalar update; only present keys are applied. post_photos mutation is
// session 018 (not here).
export interface PostPatch {
  title?: string;
  body?: string;
  visibility?: PostVisibility;
  locationLabel?: string;
  mapEnabled?: boolean;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

// The lean cluster tree the service reads from cluster-service (runtime gRPC
// shape: camelCase keys, numeric enums, ISO-string dates).
export interface ClusterItemNode {
  photoId: string;
}

export interface ClusterTreeNode {
  id: string;
  kind: number;
  dateFrom: string;
  dateTo: string;
  children: ClusterTreeNode[];
  items: ClusterItemNode[];
}

export interface ClusterResultTree {
  id: string;
  userId: string;
  status: number;
  root: ClusterTreeNode | null;
}
