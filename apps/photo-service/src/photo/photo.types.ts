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
  takenAtLocal: string | null;
  takenAtUtc: Date | null;
  takenAtTzSource: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  orientation: number | null;
  lat: number | null;
  lon: number | null;
  metadataJson: unknown | null;
  locationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// A deduped reverse-geocoded place (migration 0003). Manual editing (9q4.3) and
// geocoding produce the same shape. lat/lon = the place's representative point.
export interface LocationRecord {
  id: string;
  continent: string;
  country: string;
  region: string;
  city: string;
  district: string;
  lat: number | null;
  lon: number | null;
}

// The place carried on a processing result (decoded from proto GeoPlace, camelCase)
// and, after normalization, the dedup tuple written to `locations`.
export interface GeoPlaceInput {
  continent?: string;
  country?: string;
  region?: string;
  city?: string;
  district?: string;
  rawProviderData?: string;
}

export interface NormalizedPlace {
  continent: string;
  country: string;
  region: string;
  city: string;
  district: string;
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

export interface PhotoVariantView {
  variantType: VariantType;
  url: string;
  width: number;
  height: number;
}

export interface PhotoWithVariants {
  photo: PhotoAssetRecord;
  variants: PhotoVariantView[];
  location?: LocationRecord | null;
}

// --- ListPhotos query (session 011) -----------------------------------------
// Internal (domain-side) representation of the ListPhotos query. The gRPC
// controller is the boundary that maps proto enums/defaults onto these clean
// internal values, so the service and repository never see proto shapes.
export type PhotoSortField = 'created_at' | 'taken_at' | 'filename' | 'size_bytes';

export type SortDirection = 'asc' | 'desc';

export interface ListPhotosParams {
  userId: string;
  page: number; // 1-based; already defaulted to >= 1 by the boundary
  pageSize: number; // already clamped to 1..100 by the boundary
  sortBy: PhotoSortField;
  sortDir: SortDirection;
  statusFilter: PhotoStatus[]; // empty = all statuses
  filenameQuery: string; // '' = no filter; case-insensitive substring on filename
}

export interface ListPhotosResult {
  photos: PhotoWithVariants[];
  totalCount: number; // total rows matching the filter, ignoring pagination
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
  place?: GeoPlaceInput;
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
