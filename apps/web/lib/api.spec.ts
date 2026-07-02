import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeUpload, createUploadIntent, generateClusters, getClusteringResult, getPhoto, getUsageSummary, listClusteringMethods, listClusteringResults, listPhotos, listUsageEvents, signUp, uploadFileToPresignedUrl } from './api';

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

  it('listUsageEvents builds the events query string from filter params (s012 add-on)', async () => {
    // why: the report drives date-range / resource / event-type / pagination
    // server-side; each filter must reach the gateway as its query param.
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ lines: [], totalCount: 0, filteredTotalAmount: '0.00', currency: 'USD' })));

    const result = await listUsageEvents({ from: '2026-01-01', to: '2026-02-01', resourceType: 'storage', eventType: 'photo_processed', page: 2, pageSize: 50 });

    expect(result).toEqual({ lines: [], totalCount: 0, filteredTotalAmount: '0.00', currency: 'USD' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/v1/usage/events?');
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-02-01');
    expect(url).toContain('resource_type=storage');
    expect(url).toContain('event_type=photo_processed');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=50');
  });

  it('getUsageSummary fetches the summary endpoint with credentials (s012 add-on)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ lines: [], estimatedMonthlyCost: '0.00', currency: 'USD' })));

    const result = await getUsageSummary();

    expect(result).toEqual({ lines: [], estimatedMonthlyCost: '0.00', currency: 'USD' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/v1/usage/summary', expect.objectContaining({ credentials: 'include' }));
  });

  it('generateClusters posts method + scope + params to the gateway (session 013)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ resultId: 'r1', status: 'pending' })));

    const result = await generateClusters({ method: 'time_only', params: { linkage: 'average' } });

    expect(result).toEqual({ resultId: 'r1', status: 'pending' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/clusters/generate',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ method: 'time_only', scope: 'all', params: { linkage: 'average' } })
      })
    );
  });

  it('listClusteringResults / listClusteringMethods GET with credentials (session 013)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ results: [], methods: [] }))));

    await expect(listClusteringResults()).resolves.toEqual({ results: [] });
    await expect(listClusteringMethods()).resolves.toEqual({ methods: [] });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/v1/clustering-results', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/v1/clustering-methods', expect.objectContaining({ credentials: 'include' }));
  });

  it('getClusteringResult GETs the result by id (session 013)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'r1', status: 'ready', root: null })));

    const result = await getClusteringResult('r1');

    expect(result).toMatchObject({ id: 'r1', status: 'ready' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/v1/clustering-results/r1', expect.objectContaining({ credentials: 'include' }));
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
