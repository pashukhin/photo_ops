import { Controller } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { PostDomainService } from './post.service';
import { PostPatch, PostRecord, PostSummaryRecord, PostVisibility } from './post.types';

// proto enum <-> domain string maps. Numeric values MUST match the proto enums
// in proto/publication/v1/publication_service.proto.
const STATUS_TO_PROTO = { draft: 1, published: 2, unpublished: 3 } as const;
const VISIBILITY_TO_PROTO = { private: 1, unlisted: 2, public: 3 } as const;
const PROTO_TO_VISIBILITY: Record<number, PostVisibility> = { 1: 'private', 2: 'unlisted', 3: 'public' };

// Domain error messages that map to gRPC NOT_FOUND (→ HTTP 404 at the gateway).
const NOT_FOUND_MESSAGES = new Set(['post not found', 'cluster result not found', 'cluster node not found']);

// Domain error messages that map to gRPC INVALID_ARGUMENT (→ HTTP 400): a valid
// request the domain rejects as bad input (premature run, bad node, bad photos).
const INVALID_ARGUMENT_MESSAGES = new Set([
  'cluster result not ready',
  'node not selectable',
  'empty node',
  'invalid photo membership'
]);

export interface ProtoPostPhoto {
  photoId: string;
  order: number;
  caption: string;
}

export interface ProtoPost {
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
  photos: ProtoPostPhoto[];
}

export interface ProtoPostSummary {
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

@Controller()
export class PublicationGrpcController {
  constructor(private readonly postService: PostDomainService) {}

  @GrpcMethod('PublicationService', 'Health')
  health() {
    return { status: 'ok', service: 'publication-service' };
  }

  @GrpcMethod('PublicationService', 'CreatePostFromCluster')
  async createPostFromCluster(request: {
    userId: string;
    resultId: string;
    nodeId: string;
    title?: string;
  }): Promise<ProtoPost> {
    try {
      const record = await this.postService.createPostFromCluster({
        userId: request.userId,
        resultId: request.resultId,
        nodeId: request.nodeId,
        title: request.title ?? ''
      });
      return this.toProtoPost(record);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @GrpcMethod('PublicationService', 'GetPost')
  async getPost(request: { postId: string; userId: string }): Promise<ProtoPost> {
    try {
      return this.toProtoPost(await this.postService.getPost(request.userId, request.postId));
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @GrpcMethod('PublicationService', 'ListPosts')
  async listPosts(request: { userId: string }): Promise<{ posts: ProtoPostSummary[] }> {
    const summaries = await this.postService.listPosts(request.userId);
    return { posts: summaries.map((summary) => this.toProtoSummary(summary)) };
  }

  @GrpcMethod('PublicationService', 'UpdatePost')
  async updatePost(request: {
    postId: string;
    userId: string;
    title?: string;
    body?: string;
    visibility?: number;
    locationLabel?: string;
    mapEnabled?: boolean;
    dateFrom?: string;
    dateTo?: string;
    photos?: { photos: { photoId: string; caption: string }[] }; // replace-all wrapper (proto3 optional message)
  }): Promise<ProtoPost> {
    try {
      const record = await this.postService.updatePost(request.userId, request.postId, this.toPatch(request));
      return this.toProtoPost(record);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  // ---- proto<->domain mapping -----------------------------------------------

  private toPatch(request: {
    title?: string;
    body?: string;
    visibility?: number;
    locationLabel?: string;
    mapEnabled?: boolean;
    dateFrom?: string;
    dateTo?: string;
    photos?: { photos: { photoId: string; caption: string }[] };
  }): PostPatch {
    const patch: PostPatch = {};
    if (request.title !== undefined) patch.title = request.title;
    if (request.body !== undefined) patch.body = request.body;
    if (request.visibility !== undefined) patch.visibility = PROTO_TO_VISIBILITY[request.visibility];
    if (request.locationLabel !== undefined) patch.locationLabel = request.locationLabel;
    if (request.mapEnabled !== undefined) patch.mapEnabled = request.mapEnabled;
    if (request.dateFrom !== undefined) patch.dateFrom = request.dateFrom ? new Date(request.dateFrom) : null;
    if (request.dateTo !== undefined) patch.dateTo = request.dateTo ? new Date(request.dateTo) : null;
    // Replace-all wrapper (proto3 optional message) → flat {photoId,caption}[];
    // order is the list position, canonicalized by the repository.
    if (request.photos !== undefined) {
      patch.photos = request.photos.photos.map((p) => ({ photoId: p.photoId, caption: p.caption }));
    }
    return patch;
  }

  private toProtoPost(record: PostRecord): ProtoPost {
    return {
      id: record.id,
      userId: record.userId,
      sourceClusterId: record.sourceClusterId,
      sourceResultId: record.sourceResultId,
      title: record.title,
      body: record.body,
      status: STATUS_TO_PROTO[record.status],
      visibility: VISIBILITY_TO_PROTO[record.visibility],
      slug: record.slug ?? '',
      locationLabel: record.locationLabel,
      dateFrom: record.dateFrom ? record.dateFrom.toISOString() : '',
      dateTo: record.dateTo ? record.dateTo.toISOString() : '',
      mapEnabled: record.mapEnabled,
      publishedAt: record.publishedAt ? record.publishedAt.toISOString() : '',
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      photos: record.photos.map((p) => ({ photoId: p.photoId, order: p.order, caption: p.caption }))
    };
  }

  private toProtoSummary(record: PostSummaryRecord): ProtoPostSummary {
    return {
      id: record.id,
      title: record.title,
      status: STATUS_TO_PROTO[record.status],
      visibility: VISIBILITY_TO_PROTO[record.visibility],
      dateFrom: record.dateFrom ? record.dateFrom.toISOString() : '',
      dateTo: record.dateTo ? record.dateTo.toISOString() : '',
      photoCount: record.photoCount,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapDomainError(error: unknown) {
    if (error instanceof Error) {
      // Missing/foreign post or cluster node/result → 404; a not-yet-ready run
      // (a valid but premature request) → 400. Anything else stays UNKNOWN/500.
      if (NOT_FOUND_MESSAGES.has(error.message)) {
        return new RpcException({ code: status.NOT_FOUND, message: error.message });
      }
      if (INVALID_ARGUMENT_MESSAGES.has(error.message)) {
        return new RpcException({ code: status.INVALID_ARGUMENT, message: error.message });
      }
    }
    return error;
  }
}
