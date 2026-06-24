import { join } from 'path';
import * as protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';
import { decodeResult, encodeJob } from './processing.codec';

const root = protobuf.loadSync(join(process.cwd(), '../../proto/photo/v1/processing.proto'));
const ProcessPhotoJobType = root.lookupType('photoops.photo.v1.ProcessPhotoJob');
const PhotoProcessingResultType = root.lookupType('photoops.photo.v1.PhotoProcessingResult');

describe('processing.codec', () => {
  it('encodeJob produces bytes decodable to the ProcessPhotoJob fields', () => {
    const bytes = encodeJob({
      jobId: 'job-1',
      photoId: 'photo-1',
      userId: 'user-1',
      objectKey: 'originals/photo-1/a.jpg',
      type: 'initial',
      correlationId: 'corr-1'
    });
    const decoded = ProcessPhotoJobType.toObject(ProcessPhotoJobType.decode(bytes), { enums: Number }) as Record<
      string,
      unknown
    >;
    expect(decoded).toMatchObject({
      jobId: 'job-1',
      photoId: 'photo-1',
      userId: 'user-1',
      objectKey: 'originals/photo-1/a.jpg',
      type: 1,
      correlationId: 'corr-1'
    });
  });

  it('decodeResult maps a SUCCEEDED result with variants and attributes', () => {
    const body = PhotoProcessingResultType.encode(
      PhotoProcessingResultType.fromObject({
        jobId: 'job-1',
        photoId: 'photo-1',
        correlationId: 'corr-1',
        outcome: 1, // SUCCEEDED
        attributes: { width: 100, height: 50, takenAtLocal: '2026-01-02T09:30:00', lat: 34.05, lon: -118.25 },
        variants: [
          {
            variantType: 'thumbnail',
            objectKey: 'variants/photo-1/thumbnail.jpg',
            width: 100,
            height: 50,
            sizeBytes: 12345,
            contentType: 'image/jpeg'
          }
        ],
        metadataJson: '{"Make":"X"}'
      })
    ).finish();

    const result = decodeResult(body);

    expect(result.outcome).toBe('succeeded');
    expect(result.jobId).toBe('job-1');
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toEqual({
      variantType: 'thumbnail',
      objectKey: 'variants/photo-1/thumbnail.jpg',
      width: 100,
      height: 50,
      sizeBytes: 12345n,
      contentType: 'image/jpeg'
    });
    expect(result.attributes?.width).toBe(100);
    expect(result.attributes?.takenAtLocal).toBe('2026-01-02T09:30:00');
    expect(result.attributes?.lat).toBeCloseTo(34.05);
    expect(result.metadataJson).toBe('{"Make":"X"}');
  });

  it('decodeResult maps a FAILED result (no attributes, error message)', () => {
    const body = PhotoProcessingResultType.encode(
      PhotoProcessingResultType.fromObject({
        jobId: 'job-2',
        photoId: 'photo-2',
        outcome: 2, // FAILED
        errorMessage: 'decode error'
      })
    ).finish();

    const result = decodeResult(body);

    expect(result.outcome).toBe('failed');
    expect(result.errorMessage).toBe('decode error');
    expect(result.variants).toHaveLength(0);
    expect(result.attributes).toBeUndefined();
  });
});
