import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PhotoDomainService } from './photo.service';

@Controller()
export class PhotoGrpcController {
  constructor(private readonly photoService: PhotoDomainService) {}

  @GrpcMethod('PhotoService', 'Health')
  health() {
    return { status: 'ok', service: 'photo-service' };
  }

  @GrpcMethod('PhotoService', 'CreateUploadIntent')
  async createUploadIntent(request: { filename: string; contentType: string; sizeBytes: string; userId: string }) {
    const result = await this.photoService.createUploadIntent({
      userId: request.userId,
      filename: request.filename,
      contentType: request.contentType,
      sizeBytes: BigInt(request.sizeBytes)
    });
    return {
      photoId: result.photoId,
      objectKey: result.objectKey,
      uploadUrl: result.uploadUrl,
      expiresAt: result.expiresAt.toISOString()
    };
  }

  @GrpcMethod('PhotoService', 'CompleteUpload')
  async completeUpload(request: { photoId: string; userId: string }) {
    return this.mapPhoto(await this.photoService.completeUpload(request.userId, request.photoId));
  }

  @GrpcMethod('PhotoService', 'ListPhotos')
  async listPhotos(request: { pageSize?: number; userId: string }) {
    const photos = await this.photoService.listPhotos(request.userId, request.pageSize || 100);
    return { photos: photos.map((photo) => this.mapPhoto(photo)), nextPageToken: '' };
  }

  private mapPhoto(photo: Awaited<ReturnType<PhotoDomainService['listPhotos']>>[number]) {
    const statusMap = {
      uploading: 1,
      uploaded: 2,
      processing: 3,
      ready: 4,
      failed: 5
    } as const;
    return {
      id: photo.id,
      userId: photo.userId,
      filename: photo.filename,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes.toString(),
      objectKey: photo.objectKey,
      status: statusMap[photo.status],
      createdAt: photo.createdAt.toISOString(),
      updatedAt: photo.updatedAt.toISOString()
    };
  }
}
