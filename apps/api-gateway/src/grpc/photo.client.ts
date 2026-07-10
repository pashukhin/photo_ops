import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

// Numeric enums (PhotoSortField / SortDirection / PhotoStatus) because this
// client is configured with enums:Number; 0 means "unset" (photo-service applies
// the default). statusFilter is empty for "all". (session 011)
export interface ListPhotosInput {
  userId: string;
  page: number;
  pageSize: number;
  sortBy: number;
  sortDir: number;
  statusFilter: number[];
  filenameQuery: string;
}

// Variant views for the public post route (session 019). photo-service returns
// each owned photo's variants (short-lived presigned GET urls — variants only).
export interface PublicVariantView {
  variantType: string;
  url: string;
  width: number;
  height: number;
}
export interface PhotoVariantsForId {
  photoId: string;
  variants: PublicVariantView[];
}
export interface GetVariantsByIdsResult {
  results: PhotoVariantsForId[];
}

// Manual location set/override (9q4.3). `place` is the GeoPlace labels; lat/lon are
// the optional captured point (absent = label-only).
export interface SetPhotoLocationInput {
  userId: string;
  photoId: string;
  place: { continent?: string; country?: string; region?: string; city?: string; district?: string };
  lat?: number;
  lon?: number;
}

export interface PhotoGatewayClient {
  createUploadIntent(input: { userId: string; filename: string; contentType: string; sizeBytes: string }): Promise<unknown>;
  completeUpload(input: { userId: string; photoId: string }): Promise<unknown>;
  listPhotos(input: ListPhotosInput): Promise<unknown>;
  getPhoto(input: { userId: string; photoId: string }): Promise<unknown>;
  getVariantsByIds(input: { userId: string; photoIds: string[] }): Promise<GetVariantsByIdsResult>;
  setPhotoLocation(input: SetPhotoLocationInput): Promise<unknown>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcPhotoServiceClient {
  CreateUploadIntent(input: { userId: string; filename: string; contentType: string; sizeBytes: string }, callback: Callback<unknown>): void;
  CompleteUpload(input: { userId: string; photoId: string }, callback: Callback<unknown>): void;
  ListPhotos(input: ListPhotosInput, callback: Callback<unknown>): void;
  GetPhoto(input: { userId: string; photoId: string }, callback: Callback<unknown>): void;
  // Wire field is `photoId` (repeated), NOT `photoIds` — see getVariantsByIds.
  GetVariantsByIds(input: { userId: string; photoId: string[] }, callback: Callback<GetVariantsByIdsResult>): void;
  SetPhotoLocation(input: SetPhotoLocationInput, callback: Callback<unknown>): void;
}

@Injectable()
export class PhotoClient implements PhotoGatewayClient {
  private readonly client: GrpcPhotoServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/photo/v1/photo_service.proto');
    const packageDefinition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: Number,
      defaults: true,
      oneofs: true,
      includeDirs: [join(process.cwd(), '../../proto')]
    });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: { photo: { v1: { PhotoService: new (target: string, channelCredentials: ChannelCredentials) => GrpcPhotoServiceClient } } };
    };
    const target = process.env.PHOTO_SERVICE_GRPC_URL ?? 'photo-service:50051';
    this.client = new loaded.photoops.photo.v1.PhotoService(target, credentials.createInsecure());
  }

  async createUploadIntent(input: { userId: string; filename: string; contentType: string; sizeBytes: string }) {
    return this.call((callback) => this.client.CreateUploadIntent(input, callback));
  }

  async completeUpload(input: { userId: string; photoId: string }) {
    return this.call((callback) => this.client.CompleteUpload(input, callback));
  }

  async listPhotos(input: ListPhotosInput) {
    return this.call((callback) => this.client.ListPhotos(input, callback));
  }

  async getPhoto(input: { userId: string; photoId: string }) {
    return this.call((callback) => this.client.GetPhoto(input, callback));
  }

  async setPhotoLocation(input: SetPhotoLocationInput) {
    return this.call((callback) => this.client.SetPhotoLocation(input, callback));
  }

  // Remap the plural `photoIds` to the proto wire field `photoId` (repeated) —
  // under keepCase:false a literal pass-through of `photoIds` would be an unknown
  // field (dropped) and photo-service would receive an empty id list.
  async getVariantsByIds(input: { userId: string; photoIds: string[] }): Promise<GetVariantsByIdsResult> {
    return this.call((callback) =>
      this.client.GetVariantsByIds({ userId: input.userId, photoId: input.photoIds }, callback)
    );
  }

  private call<T>(invoke: (callback: Callback<T>) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      invoke((error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }
}
