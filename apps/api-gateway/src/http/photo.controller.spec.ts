import { describe, expect, it, vi } from 'vitest';
import { PhotoClient } from '../grpc/photo.client';
import { PhotoController } from './photo.controller';

function createController() {
  const photoClient = {
    createUploadIntent: vi.fn(),
    completeUpload: vi.fn(),
    listPhotos: vi.fn()
  } as unknown as PhotoClient;
  return { controller: new PhotoController(photoClient), photoClient };
}

describe('PhotoController', () => {
  it('delegates upload intent creation to the photo client', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.createUploadIntent).mockResolvedValue({ photoId: 'photo-1' });

    await expect(controller.createUploadIntent({ filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: '123' })).resolves.toEqual({ photoId: 'photo-1' });
  });

  it('delegates upload completion with the path photo id', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.completeUpload).mockResolvedValue({ id: 'photo-1', status: 2 });

    await expect(controller.completeUpload('photo-1')).resolves.toEqual({ id: 'photo-1', status: 2 });
    expect(photoClient.completeUpload).toHaveBeenCalledWith({ photoId: 'photo-1' });
  });

  it('lists photos with the first frame page size', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.listPhotos).mockResolvedValue({ photos: [] });

    await expect(controller.listPhotos()).resolves.toEqual({ photos: [] });
    expect(photoClient.listPhotos).toHaveBeenCalledWith({ pageSize: 100 });
  });
});
