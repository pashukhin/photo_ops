import { Injectable } from '@nestjs/common';

// Raw gRPC shapes (proto-loader: camelCase keys, numeric enums, string dates).
// The controller maps enums to strings and shapes the browser-facing DTO.
export interface PostPhotoRaw {
  photoId: string;
  order: number;
  caption: string;
}

export interface PostRaw {
  id: string;
  userId: string;
  sourceClusterId: string;
  sourceResultId: string;
  title: string;
  body: string;
  status: number;
  visibility: number;
  slug: string;
  locationLabel: string;
  dateFrom: string;
  dateTo: string;
  mapEnabled: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  photos: PostPhotoRaw[];
}

export interface PostSummaryRaw {
  id: string;
  title: string;
  status: number;
  visibility: number;
  dateFrom: string;
  dateTo: string;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostFromClusterInput {
  userId: string;
  resultId: string;
  nodeId: string;
  title: string;
}

export interface UpdatePostInput {
  userId: string;
  postId: string;
  title?: string;
  body?: string;
  visibility?: number;
  locationLabel?: string;
  mapEnabled?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface PublicationGatewayClient {
  createPostFromCluster(input: CreatePostFromClusterInput): Promise<PostRaw>;
  getPost(input: { userId: string; postId: string }): Promise<PostRaw>;
  listPosts(userId: string): Promise<{ posts: PostSummaryRaw[] }>;
  updatePost(input: UpdatePostInput): Promise<PostRaw>;
}

// GREEN holds a proto-loaded PublicationService gRPC client (mirroring
// ClusterClient) targeting PUBLICATION_SERVICE_GRPC_URL and promisifies each
// unary call. Excluded from unit coverage (IO adapter — smoke-covered).
@Injectable()
export class PublicationClient implements PublicationGatewayClient {
  createPostFromCluster(input: CreatePostFromClusterInput): Promise<PostRaw> {
    return Promise.reject(new Error(`not implemented: createPostFromCluster ${input.resultId}/${input.nodeId}`));
  }

  getPost(input: { userId: string; postId: string }): Promise<PostRaw> {
    return Promise.reject(new Error(`not implemented: getPost ${input.userId}/${input.postId}`));
  }

  listPosts(userId: string): Promise<{ posts: PostSummaryRaw[] }> {
    return Promise.reject(new Error(`not implemented: listPosts ${userId}`));
  }

  updatePost(input: UpdatePostInput): Promise<PostRaw> {
    return Promise.reject(new Error(`not implemented: updatePost ${input.userId}/${input.postId}`));
  }
}
