export type PhotoStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export type VariantType = 'thumbnail' | 'preview';

export type ProcessingType = 'initial' | 'reprocess';

export type ProcessingJobStatus = 'queued' | 'succeeded' | 'failed';

export interface PhotoAssetRecord {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  objectKey: string;
  status: PhotoStatus;
  // Extracted attributes (populated at processing finalize; null before that).
  width: number | null;
  height: number | null;
  takenAtLocal: Date | null;
  takenAtUtc: Date | null;
  takenAtTzSource: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  orientation: number | null;
  lat: number | null;
  lon: number | null;
  metadataJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadIntentInput {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
}

export interface PhotoVariantRecord {
  id: string;
  photoId: string;
  variantType: VariantType;
  objectKey: string;
  width: number;
  height: number;
  sizeBytes: bigint;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessingJobRecord {
  id: string;
  photoId: string;
  userId: string;
  type: ProcessingType;
  status: ProcessingJobStatus;
  correlationId: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Decoded shape of a PhotoProcessingResult message that the domain consumes
// (produced by processing.codec decodeResult in Task 1.4). Attribute time
// fields are ISO strings as carried on the wire; the domain converts them to
// Date (or null when empty) before persisting.
export interface ProcessingResultAttributes {
  width?: number;
  height?: number;
  takenAtLocal?: string;
  takenAtUtc?: string;
  takenAtTzSource?: string;
  cameraMake?: string;
  cameraModel?: string;
  orientation?: number;
  lat?: number | null;
  lon?: number | null;
}

export interface ProcessingResultVariant {
  variantType: VariantType;
  objectKey: string;
  width: number;
  height: number;
  sizeBytes: bigint;
  contentType: string;
}

export interface ProcessingResultInput {
  jobId: string;
  photoId: string;
  correlationId?: string;
  outcome: 'succeeded' | 'failed';
  errorMessage?: string;
  attributes?: ProcessingResultAttributes;
  variants: ProcessingResultVariant[];
  metadataJson: string;
}
