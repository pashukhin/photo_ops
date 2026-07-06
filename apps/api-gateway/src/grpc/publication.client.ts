import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

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
  photos?: { photoId: string; caption: string }[]; // replace-all; client wraps into the gRPC photos message
}

export interface PublicationGatewayClient {
  createPostFromCluster(input: CreatePostFromClusterInput): Promise<PostRaw>;
  getPost(input: { userId: string; postId: string }): Promise<PostRaw>;
  listPosts(userId: string): Promise<{ posts: PostSummaryRaw[] }>;
  updatePost(input: UpdatePostInput): Promise<PostRaw>;
  publishPost(input: { userId: string; postId: string; visibility: number }): Promise<PostRaw>;
  unpublishPost(input: { userId: string; postId: string }): Promise<PostRaw>;
  getPublicPostBySlug(slug: string): Promise<PostRaw>;
}

type Callback<T> = (error: Error | null, value: T) => void;

// Wire shape for UpdatePost: proto's `photos` is a wrapper message
// (PostPhotoList), distinct from the gateway's flat UpdatePostInput.photos.
type UpdatePostWire = Omit<UpdatePostInput, 'photos'> & {
  photos?: { photos: { photoId: string; caption: string }[] };
};

interface GrpcPublicationServiceClient {
  CreatePostFromCluster(input: CreatePostFromClusterInput, callback: Callback<PostRaw>): void;
  GetPost(input: { userId: string; postId: string }, callback: Callback<PostRaw>): void;
  ListPosts(input: { userId: string }, callback: Callback<{ posts: PostSummaryRaw[] }>): void;
  UpdatePost(input: UpdatePostWire, callback: Callback<PostRaw>): void;
  PublishPost(input: { userId: string; postId: string; visibility: number }, callback: Callback<PostRaw>): void;
  UnpublishPost(input: { userId: string; postId: string }, callback: Callback<PostRaw>): void;
  GetPublicPostBySlug(input: { slug: string }, callback: Callback<PostRaw>): void;
}

@Injectable()
export class PublicationClient implements PublicationGatewayClient {
  private readonly client: GrpcPublicationServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/publication/v1/publication_service.proto');
    const packageDefinition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: Number,
      defaults: true,
      oneofs: true,
      includeDirs: [join(process.cwd(), '../../proto')]
    });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: {
        publication: {
          v1: {
            PublicationService: new (
              target: string,
              channelCredentials: ChannelCredentials
            ) => GrpcPublicationServiceClient;
          };
        };
      };
    };
    const target = process.env.PUBLICATION_SERVICE_GRPC_URL ?? 'publication-service:50058';
    this.client = new loaded.photoops.publication.v1.PublicationService(target, credentials.createInsecure());
  }

  createPostFromCluster(input: CreatePostFromClusterInput): Promise<PostRaw> {
    return new Promise((resolve, reject) => {
      this.client.CreatePostFromCluster(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  getPost(input: { userId: string; postId: string }): Promise<PostRaw> {
    return new Promise((resolve, reject) => {
      this.client.GetPost(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  listPosts(userId: string): Promise<{ posts: PostSummaryRaw[] }> {
    return new Promise((resolve, reject) => {
      this.client.ListPosts({ userId }, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  updatePost(input: UpdatePostInput): Promise<PostRaw> {
    const { photos, ...rest } = input;
    const wire: UpdatePostWire = photos !== undefined ? { ...rest, photos: { photos } } : rest;
    return new Promise((resolve, reject) => {
      this.client.UpdatePost(wire, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  publishPost(input: { userId: string; postId: string; visibility: number }): Promise<PostRaw> {
    return new Promise((resolve, reject) => {
      this.client.PublishPost(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  unpublishPost(input: { userId: string; postId: string }): Promise<PostRaw> {
    return new Promise((resolve, reject) => {
      this.client.UnpublishPost(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  getPublicPostBySlug(slug: string): Promise<PostRaw> {
    return new Promise((resolve, reject) => {
      this.client.GetPublicPostBySlug({ slug }, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }
}
