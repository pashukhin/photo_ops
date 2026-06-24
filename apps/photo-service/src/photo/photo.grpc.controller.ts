import { Controller } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { PhotoDomainService } from './photo.service';
import { PhotoWithVariants } from './photo.types';

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
    try {
      const record = await this.photoService.completeUpload(request.userId, request.photoId);
      return this.toProtoPhoto({ photo: record, variants: [] });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @GrpcMethod('PhotoService', 'ListPhotos')
  async listPhotos(request: { pageSize?: number; userId: string }) {
    const pwvs = await this.photoService.listPhotos(request.userId, request.pageSize || 100);
    return { photos: pwvs.map((pwv) => this.toProtoPhoto(pwv)), nextPageToken: '' };
  }

  @GrpcMethod('PhotoService', 'GetPhoto')
  async getPhoto(request: { photoId: string; userId: string }) {
    try {
      const pwv = await this.photoService.getPhoto(request.userId, request.photoId);
      if (!pwv) {
        throw new Error('photo not found');
      }
      return this.toProtoPhoto(pwv);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  private toProtoPhoto(pwv: PhotoWithVariants) {
    const statusMap = {
      uploading: 1,
      uploaded: 2,
      processing: 3,
      ready: 4,
      failed: 5
    } as const;
    const p = pwv.photo;
    return {
      id: p.id,
      userId: p.userId,
      filename: p.filename,
      contentType: p.contentType,
      sizeBytes: p.sizeBytes.toString(),
      objectKey: p.objectKey,
      status: statusMap[p.status],
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      width: p.width ?? 0,
      height: p.height ?? 0,
      takenAtLocal: p.takenAtLocal ?? '',
      takenAtUtc: p.takenAtUtc ? p.takenAtUtc.toISOString() : '',
      takenAtTzSource: p.takenAtTzSource ?? '',
      cameraMake: p.cameraMake ?? '',
      cameraModel: p.cameraModel ?? '',
      orientation: p.orientation ?? 0,
      ...(p.lat !== null && { lat: p.lat }),
      ...(p.lon !== null && { lon: p.lon }),
      variants: pwv.variants.map((v) => ({
        variantType: v.variantType,
        url: v.url,
        width: v.width,
        height: v.height
      }))
    };
  }

  private mapDomainError(error: unknown) {
    if (error instanceof Error && error.message === 'photo not found') {
      return new RpcException({ code: status.NOT_FOUND, message: error.message });
    }
    return error;
  }
}
