import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PhotoClient } from '../grpc/photo.client';

@Controller('photos')
export class PhotoController {
  constructor(
    private readonly photoClient: PhotoClient,
    private readonly authService: AuthService
  ) {}

  @Post('upload-intents')
  async createUploadIntent(@Headers('cookie') cookieHeader: string | undefined, @Body() body: { filename: string; contentType: string; sizeBytes: string }) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.photoClient.createUploadIntent({ userId: auth.userId, ...body });
  }

  @Post(':photoId/complete-upload')
  async completeUpload(@Headers('cookie') cookieHeader: string | undefined, @Param('photoId') photoId: string) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.mapPhoto(await this.photoClient.completeUpload({ userId: auth.userId, photoId }));
  }

  @Get()
  async listPhotos(
    @Headers('cookie') cookieHeader: string | undefined,
    @Query() _query: { page?: string; pageSize?: string; sort?: string; dir?: string; status?: string | string[]; q?: string }
  ): Promise<{ photos: unknown[]; totalCount: number }> {
    const auth = await this.authService.requireSession(cookieHeader);

    const sortByMap: Record<string, number> = { created_at: 1, taken_at: 2, filename: 3, size_bytes: 4 };
    const sortDirMap: Record<string, number> = { asc: 1, desc: 2 };
    const statusMap: Record<string, number> = { uploading: 1, uploaded: 2, processing: 3, ready: 4, failed: 5 };

    const rawStatus = _query.status;
    const statusStrings: string[] = rawStatus === undefined ? [] : Array.isArray(rawStatus) ? rawStatus : [rawStatus];
    const statusFilter = statusStrings.map((s) => statusMap[s] ?? 0);

    const input = {
      userId: auth.userId,
      page: _query.page !== undefined ? Number(_query.page) : 0,
      pageSize: _query.pageSize !== undefined ? Number(_query.pageSize) : 0,
      sortBy: _query.sort !== undefined ? (sortByMap[_query.sort] ?? 0) : 0,
      sortDir: _query.dir !== undefined ? (sortDirMap[_query.dir] ?? 0) : 0,
      statusFilter,
      filenameQuery: _query.q ?? ''
    };

    const response = (await this.photoClient.listPhotos(input)) as { photos?: unknown[]; totalCount?: number };
    return {
      photos: (response.photos ?? []).map((p) => this.mapPhoto(p)),
      totalCount: response.totalCount ?? 0
    };
  }

  @Get(':photoId')
  async getPhoto(@Headers('cookie') cookieHeader: string | undefined, @Param('photoId') photoId: string) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.mapPhoto(await this.photoClient.getPhoto({ userId: auth.userId, photoId }));
  }

  private mapPhoto(photo: unknown) {
    if (!photo || typeof photo !== 'object') {
      return photo;
    }
    const statusMap: Record<string, string> = {
      '1': 'uploading',
      '2': 'uploaded',
      '3': 'processing',
      '4': 'ready',
      '5': 'failed',
      PHOTO_STATUS_UPLOADING: 'uploading',
      PHOTO_STATUS_UPLOADED: 'uploaded',
      PHOTO_STATUS_PROCESSING: 'processing',
      PHOTO_STATUS_READY: 'ready',
      PHOTO_STATUS_FAILED: 'failed'
    };
    const asset = photo as {
      status?: unknown;
      width?: unknown;
      height?: unknown;
      takenAtLocal?: unknown;
      takenAtUtc?: unknown;
      takenAtTzSource?: unknown;
      cameraMake?: unknown;
      cameraModel?: unknown;
      orientation?: unknown;
      lat?: unknown;
      lon?: unknown;
      variants?: unknown[];
    };
    const status = statusMap[String(asset.status)] ?? asset.status;
    // proto-loader represents proto3 `optional` presence with synthetic oneof
    // fields (e.g. `_lat`/`_lon`); strip them from the public response.
    const cleaned = Object.fromEntries(Object.entries(asset).filter(([key]) => !key.startsWith('_')));
    return { ...cleaned, status };
  }
}
