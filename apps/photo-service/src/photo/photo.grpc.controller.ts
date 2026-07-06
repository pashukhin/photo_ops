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
  async listPhotos(request: {
    userId: string;
    pageSize?: number;
    page?: number;
    sortBy?: number; // proto PhotoSortField (numeric); 0 -> created_at
    sortDir?: number; // proto SortDirection (numeric); 0 -> desc
    statusFilter?: number[]; // proto PhotoStatus numbers; [] -> all
    filenameQuery?: string;
  }): Promise<{ photos: unknown[]; totalCount: number }> {
    const sortByMap: Record<number, 'created_at' | 'taken_at' | 'filename' | 'size_bytes'> = {
      1: 'created_at',
      2: 'taken_at',
      3: 'filename',
      4: 'size_bytes'
    };
    const statusMap: Record<number, 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed'> = {
      1: 'uploading',
      2: 'uploaded',
      3: 'processing',
      4: 'ready',
      5: 'failed'
    };

    const rawPage = request.page ?? 0;
    const page = rawPage < 1 ? 1 : rawPage;

    const rawPageSize = request.pageSize ?? 0;
    const defaultedPageSize = rawPageSize < 1 ? 24 : rawPageSize;
    const pageSize = Math.min(Math.max(defaultedPageSize, 1), 100);

    const sortBy = sortByMap[request.sortBy ?? 0] ?? 'created_at';
    const sortDir = request.sortDir === 1 ? 'asc' : 'desc';

    const statusFilter = (request.statusFilter ?? [])
      .map((n) => statusMap[n])
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    const filenameQuery = request.filenameQuery ?? '';

    const result = await this.photoService.listPhotos({
      userId: request.userId,
      page,
      pageSize,
      sortBy,
      sortDir,
      statusFilter,
      filenameQuery
    });

    return {
      photos: result.photos.map((pwv) => this.toProtoPhoto(pwv)),
      totalCount: result.totalCount
    };
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

  @GrpcMethod('PhotoService', 'ListPhotoSpacetime')
  async listPhotoSpacetime(request: { userId: string }): Promise<{ photos: unknown[] }> {
    const photos = await this.photoService.listSpacetime(request.userId);
    return {
      photos: photos.map((p) => ({
        photoId: p.id,
        takenAtUtc: p.takenAtUtc ? p.takenAtUtc.toISOString() : '',
        takenAtLocal: p.takenAtLocal ?? '',
        cameraMake: p.cameraMake ?? '',
        cameraModel: p.cameraModel ?? '',
        ...(p.lat !== null && { lat: p.lat }),
        ...(p.lon !== null && { lon: p.lon })
      }))
    };
  }

  @GrpcMethod('PhotoService', 'GetVariantsByIds')
  async getVariantsByIds(request: {
    userId: string;
    photoId?: string[]; // proto `repeated string photo_id`; empty repeated -> absent
  }): Promise<{
    results: { photoId: string; variants: { variantType: string; url: string; width: number; height: number }[] }[];
  }> {
    const results = await this.photoService.getVariantsByIds(request.userId, request.photoId ?? []);
    return {
      results: results.map((r) => ({
        photoId: r.photoId,
        variants: r.variants.map((v) => ({
          variantType: v.variantType,
          url: v.url,
          width: v.width,
          height: v.height
        }))
      }))
    };
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
