import { join } from 'path';
import * as protobuf from 'protobufjs';
import { ProcessingResultInput } from './photo.types';

// Wire format for the async media-processing flows. The schema is the
// processing.proto contract; we serialize/deserialize it with protobufjs at
// runtime (the same runtime-proto approach the gRPC transport uses) rather than
// importing the source-only @photoops/proto-ts package. protobufjs exposes
// fields in camelCase.
const protoPath = join(process.cwd(), '../../proto/photo/v1/processing.proto');
const root = protobuf.loadSync(protoPath);
const ProcessPhotoJobType = root.lookupType('photoops.photo.v1.ProcessPhotoJob');
const PhotoProcessingResultType = root.lookupType('photoops.photo.v1.PhotoProcessingResult');

// ProcessingType / ProcessingOutcome enum values (see processing.proto).
const PROCESSING_TYPE = { initial: 1, reprocess: 2 } as const;
const OUTCOME_SUCCEEDED = 1;

export interface ProcessPhotoJobInput {
  jobId: string;
  photoId: string;
  userId: string;
  objectKey: string;
  type: 'initial' | 'reprocess';
  correlationId: string;
}

export function encodeJob(job: ProcessPhotoJobInput): Uint8Array {
  const message = ProcessPhotoJobType.fromObject({
    jobId: job.jobId,
    photoId: job.photoId,
    userId: job.userId,
    objectKey: job.objectKey,
    type: PROCESSING_TYPE[job.type],
    correlationId: job.correlationId
  });
  return ProcessPhotoJobType.encode(message).finish();
}

export function decodeResult(body: Uint8Array): ProcessingResultInput {
  const obj = PhotoProcessingResultType.toObject(PhotoProcessingResultType.decode(body), {
    longs: String,
    enums: Number,
    defaults: true
  }) as {
    jobId: string;
    photoId: string;
    correlationId?: string;
    outcome: number;
    errorMessage?: string;
    attributes?: {
      width?: number;
      height?: number;
      takenAtLocal?: string;
      takenAtUtc?: string;
      takenAtTzSource?: string;
      cameraMake?: string;
      cameraModel?: string;
      orientation?: number;
      lat?: number;
      lon?: number;
    } | null;
    variants?: Array<{
      variantType: string;
      objectKey: string;
      width: number;
      height: number;
      sizeBytes: string;
      contentType: string;
    }>;
    metadataJson?: string;
  };

  return {
    jobId: obj.jobId,
    photoId: obj.photoId,
    correlationId: obj.correlationId || undefined,
    outcome: obj.outcome === OUTCOME_SUCCEEDED ? 'succeeded' : 'failed',
    errorMessage: obj.errorMessage || undefined,
    attributes: obj.attributes
      ? {
          width: obj.attributes.width,
          height: obj.attributes.height,
          takenAtLocal: obj.attributes.takenAtLocal || undefined,
          takenAtUtc: obj.attributes.takenAtUtc || undefined,
          takenAtTzSource: obj.attributes.takenAtTzSource || undefined,
          cameraMake: obj.attributes.cameraMake || undefined,
          cameraModel: obj.attributes.cameraModel || undefined,
          orientation: obj.attributes.orientation,
          lat: obj.attributes.lat ?? null,
          lon: obj.attributes.lon ?? null
        }
      : undefined,
    variants: (obj.variants ?? []).map((v) => ({
      variantType: v.variantType as 'thumbnail' | 'preview',
      objectKey: v.objectKey,
      width: v.width,
      height: v.height,
      sizeBytes: BigInt(v.sizeBytes),
      contentType: v.contentType
    })),
    metadataJson: obj.metadataJson || ''
  };
}
