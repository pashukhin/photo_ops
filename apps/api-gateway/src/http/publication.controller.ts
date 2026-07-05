import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PostRaw, PostSummaryRaw, PublicationClient, UpdatePostInput } from '../grpc/publication.client';

// Proto enum (numeric, from proto-loader) <-> browser-facing string.
const STATUS: Record<number, string> = { 1: 'draft', 2: 'published', 3: 'unpublished' };
const VISIBILITY: Record<number, string> = { 1: 'private', 2: 'unlisted', 3: 'public' };
const VISIBILITY_TO_PROTO: Record<string, number> = { private: 1, unlisted: 2, public: 3 };

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

// Session-authed Post edge. userId comes from the validated session, never the
// body; proto status/visibility enum numbers map to browser strings.
@Controller('v1')
export class PublicationController {
  constructor(
    private readonly publicationClient: PublicationClient,
    private readonly authService: AuthService
  ) {}

  @Post('posts')
  async createPost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() body: CreatePostBody
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    const raw = await this.publicationClient.createPostFromCluster({
      userId: auth.userId,
      resultId: body.resultId,
      nodeId: body.nodeId,
      title: body.title ?? ''
    });
    return this.mapPost(raw);
  }

  @Get('posts')
  async listPosts(@Headers('cookie') cookieHeader: string | undefined) {
    const auth = await this.authService.requireSession(cookieHeader);
    const { posts } = await this.publicationClient.listPosts(auth.userId);
    return { posts: posts.map((summary) => this.mapSummary(summary)) };
  }

  @Get('posts/:postId')
  async getPost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('postId') postId: string
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.mapPost(await this.publicationClient.getPost({ userId: auth.userId, postId }));
  }

  @Patch('posts/:postId')
  async updatePost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('postId') postId: string,
    @Body() body: UpdatePostBody
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    const input: UpdatePostInput = { userId: auth.userId, postId };
    if (body.title !== undefined) input.title = body.title;
    if (body.body !== undefined) input.body = body.body;
    if (body.visibility !== undefined) input.visibility = VISIBILITY_TO_PROTO[body.visibility];
    if (body.locationLabel !== undefined) input.locationLabel = body.locationLabel;
    if (body.mapEnabled !== undefined) input.mapEnabled = body.mapEnabled;
    if (body.dateFrom !== undefined) input.dateFrom = body.dateFrom;
    if (body.dateTo !== undefined) input.dateTo = body.dateTo;
    return this.mapPost(await this.publicationClient.updatePost(input));
  }

  private mapPost(raw: PostRaw) {
    return {
      ...raw,
      status: STATUS[raw.status] ?? 'unspecified',
      visibility: VISIBILITY[raw.visibility] ?? 'unspecified'
    };
  }

  private mapSummary(raw: PostSummaryRaw) {
    return {
      ...raw,
      status: STATUS[raw.status] ?? 'unspecified',
      visibility: VISIBILITY[raw.visibility] ?? 'unspecified'
    };
  }
}
