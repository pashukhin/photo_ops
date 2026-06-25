import { beforeAll, describe, expect, it, vi } from 'vitest';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { PhotoDomainService } from './photo.service';

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

function makePhotoRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'photo-1',
    userId: 'user-1',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 123n,
    objectKey: 'originals/photo-1/photo.jpg',
    status: 'ready',
    width: 1920,
    height: 1080,
    takenAtLocal: '2024-01-15T10:30:00',
    takenAtUtc: new Date('2024-01-15T09:30:00.000Z'),
    takenAtTzSource: 'exif',
    cameraMake: 'Canon',
    cameraModel: 'EOS R5',
    orientation: 1,
    lat: 51.5074,
    lon: -0.1278,
    metadataJson: null,
    createdAt: new Date('2026-06-21T00:00:00.000Z'),
    updatedAt: new Date('2026-06-21T00:00:00.000Z'),
    ...overrides
  };
}

function makeVariantRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'variant-1',
    photoId: 'photo-1',
    variantType: 'thumbnail' as const,
    objectKey: 'variants/photo-1/thumbnail.jpg',
    width: 200,
    height: 150,
    sizeBytes: 5000n,
    contentType: 'image/jpeg',
    createdAt: new Date('2026-06-21T00:00:00.000Z'),
    updatedAt: new Date('2026-06-21T00:00:00.000Z'),
    ...overrides
  };
}

function createService() {
  const repository = {
    createUploading: vi.fn(),
    markUploadedForUser: vi.fn(),
    findByIdForUser: vi.fn(),
    list: vi.fn(),
    createProcessingJob: vi.fn(),
    markProcessingForUser: vi.fn(),
    finalizeJob: vi.fn(),
    upsertVariant: vi.fn(),
    applyAttributes: vi.fn(),
    setStatus: vi.fn(),
    findByIdWithVariantsForUser: vi.fn(),
    listVariantsForPhotos: vi.fn()
  };
  const storage = {
    createPresignedPutUrl: vi.fn(),
    objectExists: vi.fn(),
    createPresignedGetUrl: vi.fn()
  };
  const publisher = { publish: vi.fn() };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() };
  // Sensible defaults so completeUpload's processing kickoff runs in tests that
  // don't exercise it directly (won the uploaded->processing transition).
  repository.markProcessingForUser.mockResolvedValue(true);
  repository.createProcessingJob.mockResolvedValue({ id: 'job-default' });
  // Default: no variants (so listPhotos tests don't crash).
  repository.listVariantsForPhotos.mockResolvedValue([]);
  storage.createPresignedGetUrl.mockResolvedValue('signed://x');
  const service = new PhotoDomainService(repository, storage, publisher, logger as never);
  return { service, repository, storage, publisher, logger };
}

describe('PhotoDomainService', () => {
  it('rejects non-JPEG upload intents', async () => {
    const { service } = createService();

    await expect(
      service.createUploadIntent({ userId: 'user-1', filename: 'notes.txt', contentType: 'text/plain', sizeBytes: 10n })
    ).rejects.toThrow('unsupported content type');
  });

  it('rejects files above 25 MB', async () => {
    const { service } = createService();

    await expect(
      service.createUploadIntent({ userId: 'user-1', filename: 'large.jpg', contentType: 'image/jpeg', sizeBytes: 26n * 1024n * 1024n })
    ).rejects.toThrow('file too large');
  });

  it('creates an upload intent for a JPEG', async () => {
    const { service, repository, storage } = createService();
    repository.createUploading.mockResolvedValue({
      id: '018f0000-0000-7000-8000-000000000001',
      userId: 'user-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/018f0000-0000-7000-8000-000000000001/photo.jpg',
      status: 'uploading',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z')
    });
    storage.createPresignedPutUrl.mockResolvedValue({
      uploadUrl: 'http://localhost:9000/photo-ops-originals/key?signature=test',
      expiresAt: new Date('2026-06-21T00:15:00.000Z')
    });

    const result = await service.createUploadIntent({ userId: 'user-1', filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 123n });

    expect(result.photoId).toBe('018f0000-0000-7000-8000-000000000001');
    expect(result.uploadUrl).toContain('signature=test');
  });

  it('refuses to complete upload when object is missing', async () => {
    const { service, repository, storage } = createService();
    repository.findByIdForUser.mockResolvedValue({
      id: '018f0000-0000-7000-8000-000000000001',
      userId: 'user-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/018f0000-0000-7000-8000-000000000001/photo.jpg',
      status: 'uploading',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z')
    });
    repository.markUploadedForUser.mockResolvedValue(undefined);
    storage.objectExists.mockResolvedValue(false);

    await expect(service.completeUpload('user-1', '018f0000-0000-7000-8000-000000000001')).rejects.toThrow('uploaded object not found');
  });

  it('lists only photos for the provided user id', async () => {
    const { service, repository } = createService();
    repository.list.mockResolvedValue([]);

    await service.listPhotos('user-1');

    expect(repository.list).toHaveBeenCalledWith('user-1', 100);
  });

  it('getPhoto returns null when repository returns null (photo not found or not owned)', async () => {
    const { service, repository } = createService();
    repository.findByIdWithVariantsForUser.mockResolvedValue(null);

    const result = await service.getPhoto('user-1', 'photo-missing');

    expect(result).toBeNull();
    expect(repository.findByIdWithVariantsForUser).toHaveBeenCalledWith('user-1', 'photo-missing');
  });

  it('getPhoto presigns each variant and returns PhotoWithVariants', async () => {
    const { service, repository, storage } = createService();
    const photo = makePhotoRecord();
    const variant = makeVariantRecord();
    repository.findByIdWithVariantsForUser.mockResolvedValue({ photo, variants: [variant] });
    storage.createPresignedGetUrl.mockResolvedValue('signed://x');

    const result = await service.getPhoto('user-1', 'photo-1');

    expect(result).not.toBeNull();
    expect(result!.photo).toBe(photo);
    expect(result!.variants).toHaveLength(1);
    expect(result!.variants[0].url).toBe('signed://x');
    expect(result!.variants[0].variantType).toBe('thumbnail');
    expect(result!.variants[0].width).toBe(200);
    expect(result!.variants[0].height).toBe(150);
    expect(storage.createPresignedGetUrl).toHaveBeenCalledWith('variants/photo-1/thumbnail.jpg');
  });

  it('listPhotos fetches variants for all photos and presigns urls', async () => {
    const { service, repository, storage } = createService();
    const photo = makePhotoRecord();
    repository.list.mockResolvedValue([photo]);
    const variant = makeVariantRecord();
    repository.listVariantsForPhotos.mockResolvedValue([variant]);
    storage.createPresignedGetUrl.mockResolvedValue('signed://x');

    const result = await service.listPhotos('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].photo).toBe(photo);
    expect(result[0].variants).toHaveLength(1);
    expect(result[0].variants[0].url).toBe('signed://x');
    expect(repository.listVariantsForPhotos).toHaveBeenCalledWith(['photo-1']);
  });

  it('completes upload only for the owning user', async () => {
    const { service, repository, storage } = createService();
    repository.findByIdForUser.mockResolvedValue({
      id: 'photo-1',
      userId: 'user-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/photo-1/photo.jpg',
      status: 'uploading',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    repository.markUploadedForUser.mockResolvedValue({
      id: 'photo-1',
      userId: 'user-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/photo-1/photo.jpg',
      status: 'uploaded',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    storage.objectExists.mockResolvedValue(true);

    await service.completeUpload('user-1', 'photo-1');

    expect(repository.findByIdForUser).toHaveBeenCalledWith('user-1', 'photo-1');
    expect(repository.markUploadedForUser).toHaveBeenCalledWith('user-1', 'photo-1');
  });

  it('on complete upload: marks processing, records a job, and publishes a ProcessPhotoJob', async () => {
    const { service, repository, storage, publisher } = createService();
    const photoRecord = {
      id: 'photo-1',
      userId: 'user-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/photo-1/photo.jpg',
      status: 'uploaded',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    repository.findByIdForUser.mockResolvedValue({ ...photoRecord, status: 'uploading' });
    repository.markUploadedForUser.mockResolvedValue(photoRecord);
    repository.markProcessingForUser.mockResolvedValue(true);
    repository.createProcessingJob.mockResolvedValue({ id: 'job-1' });
    storage.objectExists.mockResolvedValue(true);

    const result = await service.completeUpload('user-1', 'photo-1');

    expect(repository.markProcessingForUser).toHaveBeenCalledWith('user-1', 'photo-1');
    expect(repository.createProcessingJob).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: 'photo-1', userId: 'user-1', type: 'initial' })
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      'photo.process',
      expect.objectContaining({ body: expect.any(Uint8Array), correlationId: expect.any(String) })
    );
    // The same correlation id must thread through the job record and the message.
    const jobCorrelationId = repository.createProcessingJob.mock.calls[0][0].correlationId;
    const messageCorrelationId = publisher.publish.mock.calls[0][1].correlationId;
    expect(jobCorrelationId).toBe(messageCorrelationId);
    expect(result.status).toBe('processing');
  });

  it('does not create a job or publish when the photo did not transition (duplicate complete)', async () => {
    const { service, repository, storage, publisher } = createService();
    repository.findByIdForUser.mockResolvedValue({
      id: 'photo-1',
      userId: 'user-1',
      objectKey: 'originals/photo-1/photo.jpg',
      status: 'processing',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    repository.markUploadedForUser.mockResolvedValue({
      id: 'photo-1',
      userId: 'user-1',
      objectKey: 'originals/photo-1/photo.jpg',
      status: 'uploaded',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    repository.markProcessingForUser.mockResolvedValue(false); // already past uploaded
    storage.objectExists.mockResolvedValue(true);

    await service.completeUpload('user-1', 'photo-1');

    expect(repository.createProcessingJob).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('finalize SUCCEEDED: upserts variants, applies attributes, marks ready', async () => {
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
      attributes: { width: 100, height: 50 }, variants: [{ variantType: 'thumbnail', objectKey: 'variants/p1/thumbnail.jpg', width: 100, height: 50, sizeBytes: 10n, contentType: 'image/jpeg' }], metadataJson: '{}' });
    expect(repository.upsertVariant).toHaveBeenCalledTimes(1);
    expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ width: 100 }));
    expect(repository.setStatus).toHaveBeenCalledWith('p1', 'ready');
  });

  it('finalize is idempotent: duplicate result (finalizeJob=false) writes nothing', async () => {
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(false);
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded', attributes: {}, variants: [], metadataJson: '{}' });
    expect(repository.upsertVariant).not.toHaveBeenCalled();
    expect(repository.setStatus).not.toHaveBeenCalled();
  });

  it('finalize FAILED: marks failed', async () => {
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'failed', errorMessage: 'bad', variants: [], metadataJson: '' });
    expect(repository.setStatus).toHaveBeenCalledWith('p1', 'failed');
  });

  it('publishes the active traceparent as the job correlation id', async () => {
    const { service, repository, storage, publisher } = createService();
    repository.findByIdForUser.mockResolvedValue(makePhotoRecord({ status: 'uploaded' }));
    storage.objectExists.mockResolvedValue(true);
    repository.markUploadedForUser.mockResolvedValue(makePhotoRecord({ status: 'uploaded' }));
    repository.markProcessingForUser.mockResolvedValue(true);
    repository.createProcessingJob.mockResolvedValue({ id: 'job-1' });

    const sc = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
    const span = trace.wrapSpanContext(sc);
    await context.with(trace.setSpan(context.active(), span), () =>
      service.completeUpload('user-1', 'photo-1')
    );

    const published = publisher.publish.mock.calls[0][1];
    expect(published.correlationId).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
  });
});
