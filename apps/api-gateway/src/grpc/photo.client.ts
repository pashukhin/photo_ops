import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

export interface PhotoGatewayClient {
  createUploadIntent(input: { filename: string; contentType: string; sizeBytes: string }): Promise<unknown>;
  completeUpload(input: { photoId: string }): Promise<unknown>;
  listPhotos(input: { pageSize: number }): Promise<unknown>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcPhotoServiceClient {
  CreateUploadIntent(input: { filename: string; contentType: string; sizeBytes: string }, callback: Callback<unknown>): void;
  CompleteUpload(input: { photoId: string }, callback: Callback<unknown>): void;
  ListPhotos(input: { pageSize: number }, callback: Callback<unknown>): void;
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

  async createUploadIntent(input: { filename: string; contentType: string; sizeBytes: string }) {
    return this.call((callback) => this.client.CreateUploadIntent(input, callback));
  }

  async completeUpload(input: { photoId: string }) {
    return this.call((callback) => this.client.CompleteUpload(input, callback));
  }

  async listPhotos(input: { pageSize: number }) {
    return this.call((callback) => this.client.ListPhotos(input, callback));
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
