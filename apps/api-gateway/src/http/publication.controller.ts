import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PhotoClient, PublicVariantView } from '../grpc/photo.client';
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
  photos?: { photoId: string; caption: string }[]; // replace-all; order = position
}

export interface PublishPostBody {
  visibility?: string; // must be 'public' | 'unlisted'
}

// Session-authed Post edge. userId comes from the validated session, never the
// body; proto status/visibility enum numbers map to browser strings.
@Controller('v1')
export class PublicationController {
  constructor(
    private readonly publicationClient: PublicationClient,
    private readonly photoClient: PhotoClient,
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
    if (body.visibility !== undefined) {
      // 4o2 #1: an unknown visibility must be a 400, not a silent 200 no-op.
      const mapped = VISIBILITY_TO_PROTO[body.visibility];
      if (mapped === undefined) {
        throw new BadRequestException(`invalid visibility: ${body.visibility}`);
      }
      input.visibility = mapped;
    }
    if (body.locationLabel !== undefined) input.locationLabel = body.locationLabel;
    if (body.mapEnabled !== undefined) input.mapEnabled = body.mapEnabled;
    // 4o2 #2: a non-empty, non-ISO date must be a 400 (never reach Drizzle). ""
    // clears the date and is allowed through unchanged.
    if (body.dateFrom !== undefined) input.dateFrom = this.validateDate(body.dateFrom, 'dateFrom');
    if (body.dateTo !== undefined) input.dateTo = this.validateDate(body.dateTo, 'dateTo');
    if (body.photos !== undefined) input.photos = body.photos;
    return this.mapPost(await this.publicationClient.updatePost(input));
  }

  @Post('posts/:postId/publish')
  async publishPost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('postId') postId: string,
    @Body() body: PublishPostBody
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    // EXPLICIT reject — VISIBILITY_TO_PROTO includes private:1, so the updatePost
    // "unknown → 400" lookup would let 'private' through. Publish is public|unlisted only.
    if (body.visibility !== 'public' && body.visibility !== 'unlisted') {
      throw new BadRequestException(`invalid visibility for publish: ${body.visibility}`);
    }
    const raw = await this.publicationClient.publishPost({
      userId: auth.userId,
      postId,
      visibility: VISIBILITY_TO_PROTO[body.visibility]
    });
    return this.mapPost(raw);
  }

  @Post('posts/:postId/unpublish')
  async unpublishPost(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('postId') postId: string
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.mapPost(await this.publicationClient.unpublishPost({ userId: auth.userId, postId }));
  }

  // PUBLIC, unauthenticated (no requireSession): a published public|unlisted post
  // by slug, with photo variant urls resolved owner-scoped from photo-service.
  // A NOT_FOUND (draft/unpublished/private/unknown) propagates as 404; a backend
  // failure (e.g. photo-service down) propagates as 500 — never masqueraded as 404.
  @Get('public/posts/:slug')
  async publicPost(@Param('slug') slug: string) {
    const raw = await this.publicationClient.getPublicPostBySlug(slug);
    const { results } = await this.photoClient.getVariantsByIds({
      userId: raw.userId, // owner id from the published post (internal), never sent to the browser
      photoIds: raw.photos.map((p) => p.photoId)
    });
    const variantsByPhotoId = new Map<string, PublicVariantView[]>();
    for (const r of results) {
      variantsByPhotoId.set(r.photoId, r.variants);
    }
    return this.mapPublicPost(raw, variantsByPhotoId);
  }

  private validateDate(value: string, field: string): string {
    if (value !== '' && Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`invalid ${field}: not an ISO date`);
    }
    return value;
  }

  // Explicit browser DTO (4o2 #4) — enumerate fields instead of spreading ...raw,
  // so a future proto field cannot auto-leak. sourceCluster/Result are intentional
  // provenance (smoke asserts them).
  private mapPost(raw: PostRaw) {
    return {
      id: raw.id,
      userId: raw.userId,
      sourceClusterId: raw.sourceClusterId,
      sourceResultId: raw.sourceResultId,
      title: raw.title,
      body: raw.body,
      status: STATUS[raw.status] ?? 'unspecified',
      visibility: VISIBILITY[raw.visibility] ?? 'unspecified',
      slug: raw.slug,
      locationLabel: raw.locationLabel,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      mapEnabled: raw.mapEnabled,
      publishedAt: raw.publishedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      photos: raw.photos.map((p) => ({ photoId: p.photoId, order: p.order, caption: p.caption }))
    };
  }

  // Public browser DTO — an explicit allow-list. NO userId/status/visibility/
  // sourceClusterId/sourceResultId (owner + provenance stay private). Each photo
  // carries only its order/caption + resolved variant urls (never originals).
  private mapPublicPost(raw: PostRaw, variantsByPhotoId: Map<string, PublicVariantView[]>) {
    return {
      slug: raw.slug,
      title: raw.title,
      body: raw.body,
      locationLabel: raw.locationLabel,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      publishedAt: raw.publishedAt,
      photos: raw.photos.map((p) => ({
        order: p.order,
        caption: p.caption,
        variants: variantsByPhotoId.get(p.photoId) ?? []
      }))
    };
  }

  private mapSummary(raw: PostSummaryRaw) {
    return {
      id: raw.id,
      title: raw.title,
      status: STATUS[raw.status] ?? 'unspecified',
      visibility: VISIBILITY[raw.visibility] ?? 'unspecified',
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      photoCount: raw.photoCount,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }
}
