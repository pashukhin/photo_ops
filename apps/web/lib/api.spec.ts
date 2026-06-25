import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeUpload, createUploadIntent, getPhoto, listPhotos, signUp, uploadFileToPresignedUrl } from './api';

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

  it('listPhotos builds the query string from params and returns photos + totalCount (session 011)', async () => {
    // why: the gallery drives sort/filter/pagination server-side; each control
    // must reach the gateway as a query param, and the total is needed for "page
    // N of M". Multi-status becomes one `status=` per value.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos: [{ id: 'p1', status: 'ready' }], totalCount: 9 })));

    const result = await listPhotos({ page: 2, pageSize: 10, sort: 'taken_at', dir: 'asc', status: ['ready', 'processing'], q: 'beach' });

    expect(result).toEqual({ photos: [{ id: 'p1', status: 'ready' }], totalCount: 9 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/photos?');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=10');
    expect(url).toContain('sort=taken_at');
    expect(url).toContain('dir=asc');
    expect(url).toContain('status=ready');
    expect(url).toContain('status=processing');
    expect(url).toContain('q=beach');
  });

  it('listPhotos with no params requests /photos with credentials and no query string (session 011)', async () => {
    // why: the first load sends no filters; the url must stay clean (no trailing
    // `?`) and still be a credentialed request.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos: [], totalCount: 0 })));

    const result = await listPhotos();

    expect(result).toEqual({ photos: [], totalCount: 0 });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/photos', expect.objectContaining({ credentials: 'include' }));
  });

  it('getPhoto fetches the detail endpoint for the id (session 011)', async () => {
    // why: the modal loads full detail via GET /photos/:id (owner-scoped at the
    // gateway).
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'p1', status: 'ready' })));

    const result = await getPhoto('p1');

    expect(result).toMatchObject({ id: 'p1' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/photos/p1', expect.objectContaining({ credentials: 'include' }));
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
