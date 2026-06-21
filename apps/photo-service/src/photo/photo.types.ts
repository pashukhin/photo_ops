export type PhotoStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface PhotoAssetRecord {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  objectKey: string;
  status: PhotoStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadIntentInput {
  filename: string;
  contentType: string;
  sizeBytes: bigint;
}
