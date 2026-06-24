import { describe, expect, it, vi } from 'vitest';
import { PhotoDomainService } from './photo.service';

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
    objectExists: vi.fn()
  };
  const publisher = { publish: vi.fn() };
  // Sensible defaults so completeUpload's processing kickoff runs in tests that
  // don't exercise it directly (won the uploaded->processing transition).
  repository.markProcessingForUser.mockResolvedValue(true);
  repository.createProcessingJob.mockResolvedValue({ id: 'job-default' });
  return { service: new PhotoDomainService(repository, storage, publisher), repository, storage, publisher };
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
});
