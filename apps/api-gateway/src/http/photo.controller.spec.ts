import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { PhotoClient } from '../grpc/photo.client';
import { PhotoController } from './photo.controller';

const BASE_PHOTO = {
  id: 'photo-1',
  status: 2,
  width: 0,
  height: 0,
  takenAtLocal: '',
  takenAtUtc: '',
  takenAtTzSource: '',
  cameraMake: '',
  cameraModel: '',
  orientation: 0,
  lat: undefined,
  lon: undefined,
  variants: []
};

const FULL_PHOTO = {
  id: 'photo-1',
  status: 4,
  width: 3024,
  height: 4032,
  takenAtLocal: '2024-01-15T10:30:00',
  takenAtUtc: '2024-01-15T09:30:00Z',
  takenAtTzSource: 'exif_offset',
  cameraMake: 'Apple',
  cameraModel: 'iPhone 15 Pro',
  orientation: 1,
  lat: 48.8566,
  lon: 2.3522,
  variants: [{ variantType: 'thumbnail', url: 'https://example.com/thumb.jpg', width: 320, height: 240 }]
};

function createController() {
  const photoClient = {
    createUploadIntent: vi.fn(),
    completeUpload: vi.fn(),
    listPhotos: vi.fn(),
    getPhoto: vi.fn()
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
    vi.mocked(photoClient.completeUpload).mockResolvedValue({ ...BASE_PHOTO, status: 2 });

    await expect(controller.completeUpload('photoops_session=session-1', 'photo-1')).resolves.toMatchObject({ id: 'photo-1', status: 'uploaded' });
    expect(photoClient.completeUpload).toHaveBeenCalledWith({ userId: 'user-1', photoId: 'photo-1' });
  });

  it('maps gallery query params onto the gRPC ListPhotos request (session 011)', async () => {
    // why: the browser sends string query params; the gateway is the boundary
    // that turns them into the numeric proto enums + numbers photo-service
    // expects, preserving multi-status order (ready, processing -> [4, 3]).
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.listPhotos).mockResolvedValue({ photos: [], totalCount: 0 });

    await controller.listPhotos('photoops_session=session-1', { page: '2', pageSize: '10', sort: 'taken_at', dir: 'asc', status: ['ready', 'processing'], q: 'beach' });

    expect(photoClient.listPhotos).toHaveBeenCalledWith({
      userId: 'user-1',
      page: 2,
      pageSize: 10,
      sortBy: 2,
      sortDir: 1,
      statusFilter: [4, 3],
      filenameQuery: 'beach'
    });
  });

  it('normalizes a single ?status= and an empty query to numeric defaults (session 011)', async () => {
    // why: NestJS yields a string for one ?status= and an array for many; an
    // empty query must still produce a well-formed input (0 -> photo-service
    // applies the documented default).
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.listPhotos).mockResolvedValue({ photos: [], totalCount: 0 });

    await controller.listPhotos('photoops_session=session-1', { status: 'failed' });
    expect(photoClient.listPhotos).toHaveBeenCalledWith({ userId: 'user-1', page: 0, pageSize: 0, sortBy: 0, sortDir: 0, statusFilter: [5], filenameQuery: '' });

    vi.mocked(photoClient.listPhotos).mockClear();
    await controller.listPhotos('photoops_session=session-1', {});
    expect(photoClient.listPhotos).toHaveBeenCalledWith({ userId: 'user-1', page: 0, pageSize: 0, sortBy: 0, sortDir: 0, statusFilter: [], filenameQuery: '' });
  });

  it('includes new attribute/variant fields and threads totalCount in the list response (session 011)', async () => {
    const { controller, photoClient } = createController();
    vi.mocked(photoClient.listPhotos).mockResolvedValue({ photos: [FULL_PHOTO], totalCount: 12 });

    const result = (await controller.listPhotos('photoops_session=session-1', {})) as { photos: Array<Record<string, unknown>>; totalCount: number };
    const photo = result.photos[0];
    expect(result.totalCount).toBe(12);
    expect(photo.width).toBe(3024);
    expect(photo.height).toBe(4032);
    expect(photo.takenAtLocal).toBe('2024-01-15T10:30:00');
    expect(photo.cameraMake).toBe('Apple');
    expect(photo.lat).toBe(48.8566);
    expect(photo.variants).toEqual([{ variantType: 'thumbnail', url: 'https://example.com/thumb.jpg', width: 320, height: 240 }]);
    expect(photo.status).toBe('ready');
  });

  describe('GET /photos/:photoId', () => {
    it('returns 200 with the mapped detail photo', async () => {
      const { controller, photoClient } = createController();
      vi.mocked(photoClient.getPhoto).mockResolvedValue(FULL_PHOTO);

      const result = await controller.getPhoto('photoops_session=session-1', 'photo-1') as Record<string, unknown>;
      expect(photoClient.getPhoto).toHaveBeenCalledWith({ userId: 'user-1', photoId: 'photo-1' });
      expect(result.id).toBe('photo-1');
      expect(result.status).toBe('ready');
      expect(result.width).toBe(3024);
      expect(result.height).toBe(4032);
      expect(result.takenAtLocal).toBe('2024-01-15T10:30:00');
      expect(result.takenAtUtc).toBe('2024-01-15T09:30:00Z');
      expect(result.takenAtTzSource).toBe('exif_offset');
      expect(result.cameraMake).toBe('Apple');
      expect(result.cameraModel).toBe('iPhone 15 Pro');
      expect(result.orientation).toBe(1);
      expect(result.lat).toBe(48.8566);
      expect(result.lon).toBe(2.3522);
      expect(result.variants).toEqual([{ variantType: 'thumbnail', url: 'https://example.com/thumb.jpg', width: 320, height: 240 }]);
    });

    it('propagates NOT_FOUND gRPC error (becomes HTTP 404 via HttpErrorFilter)', async () => {
      const { controller, photoClient } = createController();
      const notFoundError = Object.assign(new Error('not found'), { code: GrpcStatus.NOT_FOUND });
      vi.mocked(photoClient.getPhoto).mockRejectedValue(notFoundError);

      await expect(controller.getPhoto('photoops_session=session-1', 'missing-photo')).rejects.toMatchObject({ code: GrpcStatus.NOT_FOUND });
    });
  });
});
