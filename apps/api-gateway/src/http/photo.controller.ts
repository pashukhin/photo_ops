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
    await this.authService.requireSession(cookieHeader);
    // GREEN obligation (session 011): map _query onto a ListPhotosInput
    // (pinned by photo.controller.spec.ts): page/pageSize -> Number (0 when
    // absent); sort -> proto PhotoSortField number (created_at 1, taken_at 2,
    // filename 3, size_bytes 4; 0 when absent); dir -> SortDirection (asc 1,
    // desc 2; 0 when absent); status (string | string[]) -> numeric PhotoStatus
    // array preserving order (uploading 1..failed 5); q -> filenameQuery (''
    // when absent). Call photoClient.listPhotos with userId from the session,
    // then return { photos: (response.photos ?? []).map((p) => mapPhoto(p)),
    // totalCount: response.totalCount ?? 0 }.
    throw new Error('NotImplemented: PhotoController.listPhotos'); // GREEN is the implementer's job
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
