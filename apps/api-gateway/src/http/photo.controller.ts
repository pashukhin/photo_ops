import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
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
  async listPhotos(@Headers('cookie') cookieHeader: string | undefined) {
    const auth = await this.authService.requireSession(cookieHeader);
    const response = (await this.photoClient.listPhotos({ userId: auth.userId, pageSize: 100 })) as { photos?: unknown[] };
    return { ...response, photos: (response.photos ?? []).map((photo) => this.mapPhoto(photo)) };
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
    return { ...asset, status };
  }
}
