import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PostEditor } from './PostEditor';

vi.mock('../../lib/api', () => ({
  getPost: vi.fn(),
  updatePost: vi.fn(),
  listPhotos: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn()
}));

function post() {
  return {
    id: 'post-1',
    userId: 'u1',
    sourceClusterId: 'n',
    sourceResultId: 'r',
    title: 'Trip',
    body: 'day one',
    status: 'draft',
    visibility: 'private',
    slug: '',
    locationLabel: '',
    dateFrom: '',
    dateTo: '',
    mapEnabled: false,
    publishedAt: '',
    createdAt: 'c',
    updatedAt: 'u',
    photos: [
      { photoId: 'p1', order: 0, caption: 'first' },
      { photoId: 'p2', order: 1, caption: 'second' }
    ]
  };
}

function photoAsset(id: string) {
  return {
    id,
    filename: `${id}.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: '1',
    objectKey: id,
    status: 'ready',
    createdAt: 'c',
    updatedAt: 'u',
    variants: [{ variantType: 'thumbnail', url: `http://img/${id}.jpg`, width: 40, height: 40 }]
  };
}

beforeEach(() => {
  vi.clearAllMocks(); // call history is per-test — assertions read mock.calls[0]
  vi.mocked(api.getPost).mockResolvedValue(post() as never);
  vi.mocked(api.updatePost).mockResolvedValue(post() as never);
  vi.mocked(api.listPhotos).mockResolvedValue({
    photos: [photoAsset('p1'), photoAsset('p2')],
    totalCount: 2
  } as never);
});

describe('PostEditor', () => {
  it('loads the post and renders title, body, and photo thumbnails', async () => {
    // why: the editor opens on an existing draft; photos render as variant
    // thumbnails resolved client-side (like ClusterView), never originals.
    render(<PostEditor postId="post-1" />);
    expect(await screen.findByDisplayValue('Trip')).toBeTruthy();
    expect(screen.getByDisplayValue('day one')).toBeTruthy();
    expect((await screen.findByAltText('p1.jpg')).getAttribute('src')).toBe('http://img/p1.jpg');
  });

  it('saves an edited title and body', async () => {
    render(<PostEditor postId="post-1" />);
    fireEvent.change(await screen.findByDisplayValue('Trip'), { target: { value: 'Buenos Aires' } });
    fireEvent.change(screen.getByDisplayValue('day one'), { target: { value: 'morning' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(api.updatePost).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({ title: 'Buenos Aires', body: 'morning' })
      )
    );
  });

  it('saves an edited caption on the right photo', async () => {
    // why: caption is per-PostPhoto; the Save payload must pair it with its photo.
    render(<PostEditor postId="post-1" />);
    fireEvent.change(await screen.findByDisplayValue('first'), { target: { value: 'sunrise' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      const patch = vi.mocked(api.updatePost).mock.calls[0][1];
      expect(patch.photos).toEqual([
        { photoId: 'p1', caption: 'sunrise' },
        { photoId: 'p2', caption: 'second' }
      ]);
    });
  });

  it('reorders a photo down and saves the new order', async () => {
    // why: order is the list position at Save time (server canonicalizes it).
    render(<PostEditor postId="post-1" />);
    await screen.findByAltText('p1.jpg');
    fireEvent.click(screen.getAllByRole('button', { name: /move down/i })[0]); // p1 below p2
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      const patch = vi.mocked(api.updatePost).mock.calls[0][1];
      expect(patch.photos?.map((p) => p.photoId)).toEqual(['p2', 'p1']);
    });
  });

  it('removes a photo and saves without it', async () => {
    render(<PostEditor postId="post-1" />);
    await screen.findByAltText('p1.jpg');
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]); // remove p1
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      const patch = vi.mocked(api.updatePost).mock.calls[0][1];
      expect(patch.photos?.map((p) => p.photoId)).toEqual(['p2']);
    });
  });

  it('does not allow removing the last photo (a post cannot be emptied)', async () => {
    // why: an empty replace-all is rejected by the backend (400) — the editor
    // enforces the non-empty invariant so the user cannot reach that dead end.
    vi.mocked(api.getPost).mockResolvedValue({
      ...post(),
      photos: [{ photoId: 'p1', order: 0, caption: 'only' }]
    } as never);
    render(<PostEditor postId="post-1" />);
    await screen.findByAltText('p1.jpg');
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(); // 1 photo is still saveable
  });

  it('surfaces a save failure without losing the editor', async () => {
    // why: a failed Save shows a banner but keeps the edits (not a fatal page).
    vi.mocked(api.updatePost).mockRejectedValue(new Error('save boom'));
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /save/i }));
    await screen.findByText(/save boom/);
    expect(screen.getByDisplayValue('Trip')).toBeTruthy(); // editor still mounted
  });

  it('falls back to the photo id when its variant is not resolved', async () => {
    // why: a post photo missing from the ready-photo map must not vanish.
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [], totalCount: 0 } as never);
    render(<PostEditor postId="post-1" />);
    expect(await screen.findByText('p1')).toBeTruthy();
    expect(screen.getByText('p2')).toBeTruthy();
  });

  it('shows an error when the post cannot be loaded (404 / not owned)', async () => {
    // why: an unauthorized/missing draft must surface a message, not a blank page.
    vi.mocked(api.getPost).mockRejectedValue(new Error('GetPost failed: 404'));
    render(<PostEditor postId="ghost" />);
    await screen.findByText(/404|could not|not found/i);
  });

  it('publishes a draft as the selected visibility', async () => {
    // why: Publish is the atomic transition; the editor sends the chosen visibility.
    vi.mocked(api.publishPost).mockResolvedValue({
      ...post(),
      status: 'published',
      visibility: 'unlisted',
      slug: 'tok',
      publishedAt: 'x'
    } as never);
    render(<PostEditor postId="post-1" />);
    await screen.findByDisplayValue('Trip');
    fireEvent.change(screen.getByLabelText(/visibility/i), { target: { value: 'unlisted' } });
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() => expect(api.publishPost).toHaveBeenCalledWith('post-1', 'unlisted'));
  });

  it('shows the public link + Unpublish and hides Publish once published', async () => {
    // why: once published the editor surfaces the canonical /posts/<slug> link (share is 020).
    vi.mocked(api.getPost).mockResolvedValue({
      ...post(),
      status: 'published',
      visibility: 'public',
      slug: 'tok',
      publishedAt: 'x'
    } as never);
    render(<PostEditor postId="post-1" />);
    const link = await screen.findByRole('link', { name: /localhost:3000\/posts\/tok/i });
    expect(link.getAttribute('href')).toBe('http://localhost:3000/posts/tok');
    expect(screen.getByRole('button', { name: /unpublish/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^publish$/i })).toBeNull();
  });

  it('unpublishes a published post', async () => {
    vi.mocked(api.getPost).mockResolvedValue({
      ...post(),
      status: 'published',
      slug: 'tok',
      publishedAt: 'x'
    } as never);
    vi.mocked(api.unpublishPost).mockResolvedValue({ ...post(), status: 'unpublished', slug: 'tok' } as never);
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /unpublish/i }));
    await waitFor(() => expect(api.unpublishPost).toHaveBeenCalledWith('post-1'));
  });

  it('surfaces a publish failure without losing the editor', async () => {
    // why: a failed Publish shows the error, editor stays mounted.
    vi.mocked(api.publishPost).mockRejectedValue(new Error('publish boom'));
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }));
    await screen.findByText(/publish boom/);
    expect(screen.getByDisplayValue('Trip')).toBeTruthy();
  });

  it('surfaces an unpublish failure', async () => {
    vi.mocked(api.getPost).mockResolvedValue({ ...post(), status: 'published', slug: 'tok', publishedAt: 'x' } as never);
    vi.mocked(api.unpublishPost).mockRejectedValue(new Error('unpublish boom'));
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /unpublish/i }));
    await screen.findByText(/unpublish boom/);
  });
});

// --- session 020: copy-link / share ----------------------------------------
// Reuses the top-level imports + the post() fixture. jsdom has no
// navigator.clipboard — DEFINE it (vi.spyOn on undefined throws).
describe('PostEditor share (published)', () => {
  const writeText = vi.fn().mockResolvedValue(undefined); // real writeText returns Promise<void>
  beforeEach(() => {
    writeText.mockClear(); // clear calls, keep the resolved-value impl
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(api.getPost).mockResolvedValue({
      ...post(),
      title: 'Summer Crimea',
      body: 'Three days by the sea',
      status: 'published',
      visibility: 'public',
      slug: 'tok',
      publishedAt: 'x'
    } as never);
  });

  it('shows the absolute canonical URL and Copy buttons once published', async () => {
    // why: m71.5 RED — a published post exposes the canonical public URL to copy.
    render(<PostEditor postId="post-1" />);
    const link = await screen.findByRole('link', { name: /localhost:3000\/posts\/tok/i });
    expect(link.getAttribute('href')).toBe('http://localhost:3000/posts/tok');
    expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy share text/i })).toBeTruthy();
  });

  it('Copy link writes only the canonical URL to the clipboard', async () => {
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/posts/tok'));
  });

  it('Copy share text writes the full generated template', async () => {
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /copy share text/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'New photo story: Summer Crimea\nThree days by the sea\nhttp://localhost:3000/posts/tok'
      )
    );
    // both buttons surface the same shared "Copied" confirmation.
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it('shows a transient "Copied" confirmation that reverts', async () => {
    // why: feedback that the copy happened; the setTimeout revert must be covered
    // (100% diff-cover). Let the async load settle under REAL timers first, then
    // switch to fake timers only for the revert — findBy* + fake timers deadlock.
    render(<PostEditor postId="post-1" />);
    const btn = await screen.findByRole('button', { name: /copy link/i });
    vi.useFakeTimers();
    try {
      fireEvent.click(btn);
      await act(async () => {}); // flush the awaited clipboard.writeText microtask
      expect(screen.getByText(/copied/i)).toBeTruthy();
      // D2: the confirmation lives in an aria-live region (announced to SR users).
      expect(screen.getByText(/copied/i).closest('[aria-live]')).not.toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(2500); // fire the revert setTimeout
        await Promise.resolve(); // flush the state update it schedules
      });
      expect(screen.queryByText(/copied/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the copy affordance on a draft', async () => {
    // why: share is only for a published post.
    vi.mocked(api.getPost).mockResolvedValue({ ...post(), title: 'Summer Crimea', status: 'draft', slug: '' } as never);
    render(<PostEditor postId="post-1" />);
    await screen.findByDisplayValue('Summer Crimea');
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /copy share text/i })).toBeNull();
  });

  it('shows "Copy failed" when the clipboard write is rejected', async () => {
    // why: a denied/insecure-context clipboard must surface a failure, not
    // silently no-op (and not leak an unhandled rejection).
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<PostEditor postId="post-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /copy link/i }));
    expect(await screen.findByText(/copy failed/i)).toBeTruthy();
  });
});
