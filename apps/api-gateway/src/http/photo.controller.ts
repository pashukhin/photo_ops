import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PhotoClient } from '../grpc/photo.client';

@Controller('photos')
export class PhotoController {
  constructor(private readonly photoClient: PhotoClient) {}

  @Post('upload-intents')
  createUploadIntent(@Body() body: { filename: string; contentType: string; sizeBytes: string }) {
    return this.photoClient.createUploadIntent(body);
  }

  @Post(':photoId/complete-upload')
  async completeUpload(@Param('photoId') photoId: string) {
    return this.mapPhoto(await this.photoClient.completeUpload({ photoId }));
  }

  @Get()
  async listPhotos() {
    const response = (await this.photoClient.listPhotos({ pageSize: 100 })) as { photos?: unknown[] };
    return { ...response, photos: (response.photos ?? []).map((photo) => this.mapPhoto(photo)) };
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
    const asset = photo as { status?: unknown };
    const status = statusMap[String(asset.status)] ?? asset.status;
    return { ...asset, status };
  }
}
