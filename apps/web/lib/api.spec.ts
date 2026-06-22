import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeUpload, createUploadIntent, listPhotos, signUp, uploadFileToPresignedUrl } from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('web API helper', () => {
  it('creates upload intents through the gateway', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photoId: 'photo-1', uploadUrl: 'http://minio/upload' })));
    const file = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });

    await expect(createUploadIntent(file)).resolves.toEqual({ photoId: 'photo-1', uploadUrl: 'http://minio/upload' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/photos/upload-intents',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: String(file.size) })
      })
    );
  });

  it('completes uploads through the gateway', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'photo-1', status: 'uploaded' })));

    await expect(completeUpload('photo-1')).resolves.toEqual({ id: 'photo-1', status: 'uploaded' });
  });

  it('lists photos from the gateway response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos: [{ id: 'photo-1' }] })));

    await expect(listPhotos()).resolves.toEqual([{ id: 'photo-1' }]);
  });

  it('uploads the file to the presigned URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const file = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadFileToPresignedUrl('http://minio/upload', file);

    expect(fetchMock).toHaveBeenCalledWith('http://minio/upload', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: file
    });
  });

  it('uses backend error messages for signup failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'conflict', message: 'email already exists' }), {
        status: 409,
        headers: { 'content-type': 'application/json' }
      })
    );

    await expect(signUp({ email: 'person@example.com', password: 'secret123', displayName: 'Person' })).rejects.toThrow('email already exists');
  });
});
