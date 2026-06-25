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
  async listPhotos(_request: {
    userId: string;
    pageSize?: number;
    page?: number;
    sortBy?: number; // proto PhotoSortField (numeric); 0 -> created_at
    sortDir?: number; // proto SortDirection (numeric); 0 -> desc
    statusFilter?: number[]; // proto PhotoStatus numbers; [] -> all
    filenameQuery?: string;
  }): Promise<{ photos: unknown[]; totalCount: number }> {
    // GREEN obligation (session 011): map this proto request onto a
    // ListPhotosParams and return the mapped page. Defaults/clamps (pinned by
    // photo.grpc.controller.spec.ts): page 0/absent -> 1; pageSize 0/absent ->
    // 24 then clamp to 1..100; sortBy 0 -> 'created_at' (1 created_at, 2 taken_at,
    // 3 filename, 4 size_bytes); sortDir 0 -> 'desc' (1 asc, 2 desc); statusFilter
    // numbers -> status strings (1 uploading..5 failed) dropping unknown/0;
    // filenameQuery -> ''. Then call photoService.listPhotos(params) and return
    // { photos: result.photos.map((pwv) => this.toProtoPhoto(pwv)), totalCount:
    // result.totalCount }.
    throw new Error('NotImplemented: PhotoGrpcController.listPhotos'); // GREEN is the implementer's job
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
