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
  completeUpload(@Param('photoId') photoId: string) {
    return this.photoClient.completeUpload({ photoId });
  }

  @Get()
  listPhotos() {
    return this.photoClient.listPhotos({ pageSize: 100 });
  }
}
