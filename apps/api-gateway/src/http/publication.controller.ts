import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PublicationClient } from '../grpc/publication.client';

export interface CreatePostBody {
  resultId: string;
  nodeId: string;
  title?: string;
}

export interface UpdatePostBody {
  title?: string;
  body?: string;
  visibility?: string;
  locationLabel?: string;
  mapEnabled?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

// Session-authed Post edge. Maps the browser DTO <-> gRPC: proto status/
// visibility enum numbers <-> strings; userId comes from the validated session,
// never the body. GREEN fills the bodies; the RED spec pins the mapping.
@Controller('v1')
export class PublicationController {
  constructor(
    private readonly publicationClient: PublicationClient,
    private readonly authService: AuthService
  ) {}

  @Post('posts')
  createPost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() body: CreatePostBody
  ): Promise<unknown> {
    return Promise.reject(new Error(`not implemented: createPost ${body.resultId}/${body.nodeId} (cookie=${typeof cookieHeader})`));
  }

  @Get('posts')
  listPosts(@Headers('cookie') cookieHeader: string | undefined): Promise<{ posts: unknown[] }> {
    return Promise.reject(new Error(`not implemented: listPosts (cookie=${typeof cookieHeader})`));
  }

  @Get('posts/:postId')
  getPost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('postId') postId: string
  ): Promise<unknown> {
    return Promise.reject(new Error(`not implemented: getPost ${postId} (cookie=${typeof cookieHeader})`));
  }

  @Patch('posts/:postId')
  updatePost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('postId') postId: string,
    @Body() body: UpdatePostBody
  ): Promise<unknown> {
    return Promise.reject(new Error(`not implemented: updatePost ${postId} ${JSON.stringify(body)} (cookie=${typeof cookieHeader})`));
  }
}
