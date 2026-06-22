import { describe, expect, it, vi } from 'vitest';
import { PhotoClient } from '../grpc/photo.client';
import { PhotoController } from './photo.controller';

function createController() {
  const photoClient = {
    createUploadIntent: vi.fn(),
    completeUpload: vi.fn(),
    listPhotos: vi.fn()
  } as unknown as PhotoClient;
  const authService = { requireSession: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
  return { controller: new PhotoController(photoClient, authService as never), photoClient, authService };
}

describe('PhotoController', () => {
  it('delegates upload intent creation to the photo client', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.createUploadIntent).mockResolvedValue({ photoId: 'photo-1' });

    await expect(controller.createUploadIntent('photoops_session=session-1', { filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: '123' })).resolves.toEqual({ photoId: 'photo-1' });
    expect(photoClient.createUploadIntent).toHaveBeenCalledWith({ userId: 'user-1', filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: '123' });
  });

  it('delegates upload completion with the path photo id', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.completeUpload).mockResolvedValue({ id: 'photo-1', status: 2 });

    await expect(controller.completeUpload('photoops_session=session-1', 'photo-1')).resolves.toEqual({ id: 'photo-1', status: 'uploaded' });
    expect(photoClient.completeUpload).toHaveBeenCalledWith({ userId: 'user-1', photoId: 'photo-1' });
  });

  it('lists photos with the first frame page size', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.listPhotos).mockResolvedValue({ photos: [{ id: 'photo-1', status: 2 }] });

    await expect(controller.listPhotos('photoops_session=session-1')).resolves.toEqual({ photos: [{ id: 'photo-1', status: 'uploaded' }] });
    expect(photoClient.listPhotos).toHaveBeenCalledWith({ userId: 'user-1', pageSize: 100 });
  });
});
