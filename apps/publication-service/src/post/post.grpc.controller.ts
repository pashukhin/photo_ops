import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PostDomainService } from './post.service';

// Proto-facing shapes (proto-loader: camelCase keys, numeric enums, string
// dates). The controller is the proto<->domain boundary: it maps status/
// visibility strings to the proto enum numbers, Date|null to ISO-string|'', and
// builds a PostPatch from only the present UpdatePost fields. Enum numbers MUST
// match proto/publication/v1/publication_service.proto (draft=1/published=2/
// unpublished=3; private=1/unlisted=2/public=3).
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
  createPostFromCluster(request: {
    userId: string;
    resultId: string;
    nodeId: string;
    title?: string;
  }): Promise<ProtoPost> {
    return Promise.reject(new Error(`not implemented: CreatePostFromCluster ${request.resultId}/${request.nodeId}`));
  }

  @GrpcMethod('PublicationService', 'GetPost')
  getPost(request: { postId: string; userId: string }): Promise<ProtoPost> {
    return Promise.reject(new Error(`not implemented: GetPost ${request.postId}/${request.userId}`));
  }

  @GrpcMethod('PublicationService', 'ListPosts')
  listPosts(request: { userId: string }): Promise<{ posts: ProtoPostSummary[] }> {
    return Promise.reject(new Error(`not implemented: ListPosts ${request.userId}`));
  }

  @GrpcMethod('PublicationService', 'UpdatePost')
  updatePost(request: {
    postId: string;
    userId: string;
    title?: string;
    body?: string;
    visibility?: number;
    locationLabel?: string;
    mapEnabled?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ProtoPost> {
    return Promise.reject(new Error(`not implemented: UpdatePost ${request.postId}/${request.userId}`));
  }
}
