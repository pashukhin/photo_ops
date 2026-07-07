import { beforeAll, describe, expect, it, vi } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import { PhotoDomainService, normalizePlace } from './photo.service';
import { ListPhotosParams } from './photo.types';
import { registerTestOtel } from './test-otel';

function makeListParams(overrides: Partial<ListPhotosParams> = {}): ListPhotosParams {
  return {
    userId: 'user-1',
    page: 1,
    pageSize: 24,
    sortBy: 'created_at',
    sortDir: 'desc',
    statusFilter: [],
    filenameQuery: '',
    ...overrides
  };
}

beforeAll(() => {
  registerTestOtel();
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
    locationId: null,
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
    listReadyForUser: vi.fn(),
    createProcessingJob: vi.fn(),
    markProcessingForUser: vi.fn(),
    finalizeJob: vi.fn(),
    findJobById: vi.fn(),
    upsertVariant: vi.fn(),
    applyAttributes: vi.fn(),
    setStatus: vi.fn(),
    findByIdWithVariantsForUser: vi.fn(),
    listVariantsForPhotos: vi.fn(),
    findVariantsByIdsForUser: vi.fn(),
    upsertLocation: vi.fn(),
    listLocationsByIds: vi.fn()
  };
  const storage = {
    createPresignedPutUrl: vi.fn(),
    objectExists: vi.fn(),
    createPresignedGetUrl: vi.fn()
  };
  const publisher = { publish: vi.fn() };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() };
  const usageEmitter = { emitOriginalStored: vi.fn(), emitProcessingConsumption: vi.fn() };
  // Sensible defaults so completeUpload's processing kickoff runs in tests that
  // don't exercise it directly (won the uploaded->processing transition).
  repository.markProcessingForUser.mockResolvedValue(true);
  repository.createProcessingJob.mockResolvedValue({ id: 'job-default' });
  repository.findJobById.mockResolvedValue({ id: 'job-default', userId: 'user-1' });
  // Default: no variants / no locations (so listPhotos + getPhoto tests don't crash).
  repository.listVariantsForPhotos.mockResolvedValue([]);
  repository.listLocationsByIds.mockResolvedValue([]);
  storage.createPresignedGetUrl.mockResolvedValue('signed://x');
  usageEmitter.emitOriginalStored.mockResolvedValue(undefined);
  usageEmitter.emitProcessingConsumption.mockResolvedValue(undefined);
  const service = new PhotoDomainService(repository, storage, publisher, logger as never, usageEmitter as never);
  return { service, repository, storage, publisher, logger, usageEmitter };
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

  it('listPhotos passes the full query params straight through to the repository (session 011)', async () => {
    // why: filtering/sorting/pagination is owned by the repository SQL; the
    // service must forward the already-defaulted params verbatim, not re-derive.
    const { service, repository } = createService();
    repository.list.mockResolvedValue({ rows: [], totalCount: 0 });
    const params = makeListParams({ page: 2, pageSize: 10, sortBy: 'taken_at', sortDir: 'asc', statusFilter: ['processing', 'ready'], filenameQuery: 'beach' });

    await service.listPhotos(params);

    expect(repository.list).toHaveBeenCalledWith(params);
  });

  it('listSpacetime returns the ready photos for the user (session 013)', async () => {
    // why: the internal ListPhotoSpacetime read-RPC feeds clustering; it forwards
    // the caller's ready photos from the repository, owner-scoped.
    const { service, repository } = createService();
    const rows = [{ id: 'p1' }] as never; // service forwards verbatim; shape is the repo's concern
    repository.listReadyForUser.mockResolvedValue(rows);

    const result = await service.listSpacetime('user-1');

    expect(repository.listReadyForUser).toHaveBeenCalledWith('user-1');
    expect(result).toBe(rows);
  });

  it('listPhotos returns the real totalCount even when the page is empty (session 011)', async () => {
    // why: a page past the end has zero rows but the UI still needs the total to
    // render "page N of M"; an empty page must not collapse totalCount to 0.
    const { service, repository } = createService();
    repository.list.mockResolvedValue({ rows: [], totalCount: 42 });

    const result = await service.listPhotos(makeListParams({ page: 99 }));

    expect(result.photos).toEqual([]);
    expect(result.totalCount).toBe(42);
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

  it('listPhotos composes each photo with its presigned variants and threads totalCount (session 011)', async () => {
    // why: the gallery renders variant urls per row plus the total count; the
    // service groups variants by photo id and passes repository.totalCount on.
    const { service, repository, storage } = createService();
    const photo = makePhotoRecord();
    repository.list.mockResolvedValue({ rows: [photo], totalCount: 7 });
    const variant = makeVariantRecord();
    repository.listVariantsForPhotos.mockResolvedValue([variant]);
    storage.createPresignedGetUrl.mockResolvedValue('signed://x');

    const result = await service.listPhotos(makeListParams());

    expect(result.totalCount).toBe(7);
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].photo).toBe(photo);
    expect(result.photos[0].variants).toHaveLength(1);
    expect(result.photos[0].variants[0].url).toBe('signed://x');
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

  it('completeUpload is idempotent: a duplicate complete for an already-processed photo does not reset status, reprocess, or re-bill', async () => {
    const { service, repository, storage, publisher, usageEmitter } = createService();
    // Photo already fully processed (status 'ready'); a retried / double-clicked /
    // gRPC-retried CompleteUpload arrives. It must NOT regress status back to
    // 'uploaded' or start a second billable processing run (charge-once key is the
    // jobId, not the photoId, so a re-kick double-bills).
    repository.findByIdForUser.mockResolvedValue(makePhotoRecord({ status: 'ready' }));
    storage.objectExists.mockResolvedValue(true);
    // The repo could still perform the transition if asked — assert the service does not ask.
    repository.markUploadedForUser.mockResolvedValue(makePhotoRecord({ status: 'uploaded' }));

    const result = await service.completeUpload('user-1', 'photo-1');

    expect(repository.markUploadedForUser).not.toHaveBeenCalled();
    expect(repository.markProcessingForUser).not.toHaveBeenCalled();
    expect(repository.createProcessingJob).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(usageEmitter.emitOriginalStored).not.toHaveBeenCalled();
    expect(result.status).toBe('ready');
  });

  it('finalize SUCCEEDED: upserts variants, applies attributes, marks ready', async () => {
    const { service, repository, logger } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'user-1', status: 'succeeded' });
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
      attributes: { width: 100, height: 50 }, variants: [{ variantType: 'thumbnail', objectKey: 'variants/p1/thumbnail.jpg', width: 100, height: 50, sizeBytes: 10n, contentType: 'image/jpeg' }], metadataJson: '{}' });
    expect(repository.upsertVariant).toHaveBeenCalledTimes(1);
    expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ width: 100 }));
    expect(repository.setStatus).toHaveBeenCalledWith('p1', 'ready');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'processing.finalized' }),
      'processing.finalized'
    );
  });

  it('losing/mismatched duplicate (recorded winner != outcome) writes nothing', async () => {
    // why (opm/M1): a result whose outcome does not match the job's RECORDED winner is a
    // losing/stale duplicate — it must apply no terminal writes (must not clobber).
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(false);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'user-1', status: 'failed' });
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded', attributes: {}, variants: [], metadataJson: '{}' });
    expect(repository.upsertVariant).not.toHaveBeenCalled();
    expect(repository.setStatus).not.toHaveBeenCalled();
  });

  it('finalize FAILED: marks failed', async () => {
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'user-1', status: 'failed' });
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'failed', errorMessage: 'bad', variants: [], metadataJson: '' });
    expect(repository.setStatus).toHaveBeenCalledWith('p1', 'failed');
  });

  it('crash-recovery: redelivery (finalizeJob=false, recorded winner succeeded) re-applies terminal state → ready', async () => {
    // why (opm): a crash after finalizeJob but before setStatus strands the photo in
    // 'processing'. Redelivery finds finalizeJob=false; because the RECORDED winner is
    // 'succeeded', the idempotent terminal writes must still be applied. Current code
    // early-returns on !applied → nothing applied → RED.
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(false);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
      attributes: {}, variants: [{ variantType: 'thumbnail', objectKey: 'variants/p1/thumbnail.jpg', width: 1, height: 1, sizeBytes: 1n, contentType: 'image/jpeg' }], metadataJson: '{}' });
    expect(repository.upsertVariant).toHaveBeenCalledTimes(1);
    expect(repository.setStatus).toHaveBeenCalledWith('p1', 'ready');
  });

  it('regression guard: a losing opposite-outcome duplicate does NOT clobber the winner', async () => {
    // why (M1): SUCCEEDED won (recorded job.status='succeeded'); a redelivered FAILED for
    // the same job must be ignored, not flip the good photo to 'failed'.
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(false);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
    await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'failed', errorMessage: 'x', variants: [], metadataJson: '' });
    expect(repository.setStatus).not.toHaveBeenCalledWith('p1', 'failed');
  });

  it('normalizePlace trims and coalesces missing fields to empty string', () => {
    // why (B1): the UNIQUE dedup key needs real '' (not null/undefined) — Postgres
    // treats NULL as distinct, so nullable columns would never dedup.
    expect(normalizePlace({ continent: '  South America ', country: 'Argentina', city: 'Buenos Aires ' })).toEqual({
      continent: 'South America',
      country: 'Argentina',
      region: '',
      city: 'Buenos Aires',
      district: ''
    });
  });

  it('normalizePlace preserves display case (no lower-casing in 022)', () => {
    // why: geocoded places are consistently cased; the tag must read "Buenos Aires".
    expect(normalizePlace({ city: 'Buenos Aires' }).city).toBe('Buenos Aires');
  });

  it('finalizeResult upserts a Location and links it when the result carries a place', async () => {
    // why (3iy): a geocoded place → one deduped Location → photo.location_id.
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
    repository.upsertLocation.mockResolvedValue('loc-1');
    await service.finalizeResult({
      jobId: 'j1',
      photoId: 'p1',
      outcome: 'succeeded',
      attributes: {
        lat: -34.6,
        lon: -58.38,
        place: { continent: 'South America', country: 'Argentina', region: '', city: 'Buenos Aires', district: '', rawProviderData: '{"lat":-34.6,"lon":-58.38}' }
      },
      variants: [],
      metadataJson: '{}'
    });
    expect(repository.upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ country: 'Argentina', city: 'Buenos Aires' }));
    expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ locationId: 'loc-1' }));
  });

  it('finalizeResult sets no location when the result carries no place', async () => {
    // why (§3.4): no GPS / geocoder-down → location_id null, photo still ready.
    const { service, repository } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
    await service.finalizeResult({
      jobId: 'j1',
      photoId: 'p1',
      outcome: 'succeeded',
      attributes: { lat: null, lon: null },
      variants: [],
      metadataJson: '{}'
    });
    expect(repository.upsertLocation).not.toHaveBeenCalled();
    expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ locationId: null }));
  });

  it('completeUpload success: emits emitOriginalStored once with correct args', async () => {
    // why: usage accounting requires a usage event per upload completion;
    // emitting is best-effort and must not block the upload flow.
    const { service, repository, storage, usageEmitter } = createService();
    const photo = { id: 'photo-1', userId: 'user-1', sizeBytes: 5000n, objectKey: 'originals/photo-1/photo.jpg', status: 'uploading', createdAt: new Date(), updatedAt: new Date() };
    repository.findByIdForUser.mockResolvedValue(photo);
    repository.markUploadedForUser.mockResolvedValue({ ...photo, status: 'uploaded' });
    storage.objectExists.mockResolvedValue(true);

    await service.completeUpload('user-1', 'photo-1');

    expect(usageEmitter.emitOriginalStored).toHaveBeenCalledOnce();
    expect(usageEmitter.emitOriginalStored).toHaveBeenCalledWith({ photoId: 'photo-1', userId: 'user-1', sizeBytes: 5000n });
  });

  it('completeUpload: emit failure is swallowed (best-effort)', async () => {
    // why: a usage publish failure must not break the upload flow.
    const { service, repository, storage, usageEmitter } = createService();
    const photo = { id: 'photo-1', userId: 'user-1', sizeBytes: 100n, objectKey: 'originals/photo-1/photo.jpg', status: 'uploading', createdAt: new Date(), updatedAt: new Date() };
    repository.findByIdForUser.mockResolvedValue(photo);
    repository.markUploadedForUser.mockResolvedValue({ ...photo, status: 'uploaded' });
    storage.objectExists.mockResolvedValue(true);
    usageEmitter.emitOriginalStored.mockRejectedValue(new Error('broker down'));

    // Should NOT throw even though the emitter failed.
    await expect(service.completeUpload('user-1', 'photo-1')).resolves.not.toThrow();
  });

  it('finalizeResult SUCCEEDED: emits emitProcessingConsumption once', async () => {
    // why: processing consumption must be reported on success.
    const { service, repository, usageEmitter } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    repository.findJobById.mockResolvedValue({ id: 'job-1', userId: 'u-2', status: 'succeeded' });

    const result = { jobId: 'job-1', photoId: 'p-1', outcome: 'succeeded' as const,
      attributes: {}, variants: [{ variantType: 'thumbnail' as const, objectKey: 'k', width: 10, height: 10, sizeBytes: 100n, contentType: 'image/jpeg' }], metadataJson: '{}' };

    await service.finalizeResult(result);

    expect(usageEmitter.emitProcessingConsumption).toHaveBeenCalledOnce();
    expect(usageEmitter.emitProcessingConsumption).toHaveBeenCalledWith({ result, userId: 'u-2' });
  });

  it('finalizeResult FAILED: does NOT emit emitProcessingConsumption', async () => {
    // why: failed processing must not generate a usage charge.
    const { service, repository, usageEmitter } = createService();
    repository.finalizeJob.mockResolvedValue(true);
    repository.findJobById.mockResolvedValue({ id: 'job-1', userId: 'u-2', status: 'failed' });

    await service.finalizeResult({ jobId: 'job-1', photoId: 'p-1', outcome: 'failed', errorMessage: 'bad', variants: [], metadataJson: '' });

    expect(usageEmitter.emitProcessingConsumption).not.toHaveBeenCalled();
  });

  it('publishes the active traceparent as the job correlation id', async () => {
    const { service, repository, storage, publisher } = createService();
    // A first CompleteUpload starts from 'uploading' (CreateUploadIntent sets it);
    // only then does the guarded uploading->uploaded->processing kickoff run.
    repository.findByIdForUser.mockResolvedValue(makePhotoRecord({ status: 'uploading' }));
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

describe('PhotoDomainService.getVariantsByIds', () => {
  it('resolves owner-scoped variant views for the given ids, omitting non-owned/absent ids', async () => {
    // why: public delivery batches a published post's photo_ids → variant URLs in
    // one call; a non-owned/unknown id is silently absent (no leak); only variants
    // (never originals) carry a URL.
    const { service, repository, storage } = createService();
    repository.findVariantsByIdsForUser.mockResolvedValue([
      { photoId: 'p1', variants: [makeVariantRecord({ photoId: 'p1', objectKey: 'k1', width: 40, height: 40 })] }
    ]);
    storage.createPresignedGetUrl.mockResolvedValue('http://img/k1');

    const result = await service.getVariantsByIds('user-1', ['p1', 'pX']);

    expect(repository.findVariantsByIdsForUser).toHaveBeenCalledWith('user-1', ['p1', 'pX']);
    expect(result).toEqual([
      { photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/k1', width: 40, height: 40 }] }
    ]);
  });
});
