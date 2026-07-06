import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicPost, publishPost, unpublishPost } from './api';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(res: { ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  const fetchMock = vi.fn().mockResolvedValue(res as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('publish/unpublish/getPublicPost api', () => {
  it('publishPost POSTs the visibility with credentials', async () => {
    const f = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 'post-1', status: 'published', slug: 'tok' }) });
    await publishPost('post-1', 'unlisted');
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/posts\/post-1\/publish$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ visibility: 'unlisted' });
  });

  it('unpublishPost POSTs to the unpublish route', async () => {
    const f = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 'post-1', status: 'unpublished' }) });
    await unpublishPost('post-1');
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/posts\/post-1\/unpublish$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('getPublicPost returns the DTO on 200 and null on 404 (server-side, no credentials)', async () => {
    const ok = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ slug: 'tok', title: 'Trip', photos: [] }) });
    expect(await getPublicPost('tok')).toMatchObject({ slug: 'tok', title: 'Trip' });
    // server-side fetch carries no session cookie
    expect((ok.mock.calls[0][1] as RequestInit | undefined)?.credentials).toBeUndefined();

    stubFetch({ ok: false, status: 404 });
    expect(await getPublicPost('ghost')).toBeNull();
  });

  it('throws on a non-ok publish / unpublish / getPublicPost (non-404)', async () => {
    // why: a failed publish/unpublish surfaces; a 5xx public read is NOT a 404.
    stubFetch({ ok: false, status: 400, text: () => Promise.resolve('bad') });
    await expect(publishPost('post-1', 'public')).rejects.toThrow(/PublishPost failed|bad/);

    stubFetch({ ok: false, status: 500, text: () => Promise.resolve('boom') });
    await expect(unpublishPost('post-1')).rejects.toThrow(/UnpublishPost failed|boom/);

    stubFetch({ ok: false, status: 500, text: () => Promise.resolve('down') });
    await expect(getPublicPost('tok')).rejects.toThrow(/GetPublicPost failed|down/);
  });
});
