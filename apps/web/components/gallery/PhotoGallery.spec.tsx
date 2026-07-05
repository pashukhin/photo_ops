import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoAsset } from '../../lib/api';
import * as api from '../../lib/api';
import { PhotoGallery } from './PhotoGallery';
import { GALLERY_POLL_MS, GALLERY_POLL_MAX_ERRORS, GALLERY_POLL_MAX_TICKS } from './types';

vi.mock('../../lib/api', () => ({
  listPhotos: vi.fn(),
  getPhoto: vi.fn()
}));

const READY_PHOTO: PhotoAsset = {
  id: 'p1',
  filename: 'beach.jpg',
  contentType: 'image/jpeg',
  sizeBytes: '2048',
  objectKey: 'originals/p1/beach.jpg',
  status: 'ready',
  createdAt: '2026-06-21T00:00:00.000Z',
  updatedAt: '2026-06-21T00:00:00.000Z',
  width: 4000,
  height: 3000,
  takenAtLocal: '2024-07-01T12:00:00',
  cameraMake: 'Apple',
  cameraModel: 'iPhone 15',
  variants: [
    { variantType: 'thumbnail', url: 'http://img/thumb1.jpg', width: 200, height: 150 },
    { variantType: 'preview', url: 'http://img/preview1.jpg', width: 1200, height: 900 }
  ]
};

// A still-processing photo with no extracted attributes/variants yet.
const PROCESSING_PHOTO: PhotoAsset = {
  id: 'p2',
  filename: 'mountain.jpg',
  contentType: 'image/jpeg',
  sizeBytes: '1024',
  objectKey: 'originals/p2/mountain.jpg',
  status: 'processing',
  createdAt: '2026-06-21T00:00:00.000Z',
  updatedAt: '2026-06-21T00:00:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Restore real timers even if a fake-timer test fails before its own
// vi.useRealTimers(), so a leaked fake clock can't hang a later test.
afterEach(() => {
  vi.useRealTimers();
});

describe('PhotoGallery (session 011)', () => {
  it('renders a row per photo with filename, status badge, and a fallback for missing attributes', async () => {
    // why: covers both driving stories — the status column and the attribute
    // table; processing photos have no attributes so those cells fall back.
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO, PROCESSING_PHOTO], totalCount: 2 });

    render(<PhotoGallery />);

    expect(await screen.findByText('beach.jpg')).toBeInTheDocument();
    expect(screen.getByText('mountain.jpg')).toBeInTheDocument();
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument(); // camera for the ready photo
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // missing-attr fallback
  });

  it('opens a detail modal with the preview image and detail when a row is clicked', async () => {
    // why: story 2 — clicking a row opens a modal with detail and a working
    // preview served from the presigned preview-variant url; the modal re-fetches
    // detail for a fresh url.
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 });
    vi.mocked(api.getPhoto).mockResolvedValue(READY_PHOTO);

    render(<PhotoGallery />);
    fireEvent.click(await screen.findByText('beach.jpg'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'http://img/preview1.jpg');
    expect(within(dialog).getByText('iPhone 15')).toBeInTheDocument();
    expect(api.getPhoto).toHaveBeenCalledWith('p1');
  });

  it('re-queries server-side when the search text or page changes', async () => {
    // why: sort/filter/pagination are server-side; editing a control must drive a
    // new listPhotos call with the mapped params, not filter the page in-memory.
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO], totalCount: 30 });

    render(<PhotoGallery />);
    await screen.findByText('beach.jpg');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'mount' } });
    await waitFor(() => expect(api.listPhotos).toHaveBeenCalledWith(expect.objectContaining({ q: 'mount' })));

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(api.listPhotos).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('resets to page 1 when the query changes (so a narrower result set is not viewed past its end)', async () => {
    // why: review finding — changing the filter while on a later page would
    // otherwise fetch an out-of-range page and render a blank table.
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO], totalCount: 60 });

    render(<PhotoGallery />);
    await screen.findByText('beach.jpg');

    fireEvent.click(screen.getByRole('button', { name: /next/i })); // -> page 2
    await waitFor(() => expect(api.listPhotos).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'x' } }); // query change
    await waitFor(() => expect(api.listPhotos).toHaveBeenCalledWith(expect.objectContaining({ q: 'x', page: 1 })));
  });

  it('shows a loading state, then the empty state when there are no photos', async () => {
    // why: per the UX-states requirement; an authenticated user with no photos
    // sees an empty message, not a blank table.
    let resolveList!: (value: { photos: PhotoAsset[]; totalCount: number }) => void;
    vi.mocked(api.listPhotos).mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    render(<PhotoGallery />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    resolveList({ photos: [], totalCount: 0 });
    expect(await screen.findByText(/no photos/i)).toBeInTheDocument();
  });

  it('shows an error alert when the list request fails', async () => {
    // why: per the UX-states requirement; a failed fetch surfaces an error, not a
    // silent empty table.
    vi.mocked(api.listPhotos).mockRejectedValue(new Error('boom'));

    render(<PhotoGallery />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/boom|error|fail/i);
  });

  it('polls while a photo is processing and stops once all photos are settled', async () => {
    // why: statuses progress server-side after upload; the table must refresh
    // itself while work is in flight and must NOT keep polling forever once done.
    vi.useFakeTimers();
    vi.mocked(api.listPhotos)
      .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 })
      .mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 });

    render(<PhotoGallery />);
    // act() wraps the fake-timer advances because they flush promise callbacks
    // that call setState outside React's auto-act scopes; assertions unchanged.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // initial load resolves
    expect(api.listPhotos).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS); }); // still processing -> one poll
    expect(api.listPhotos).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS * 3); }); // now settled -> no more polls
    expect(api.listPhotos).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('refetches when the reloadToken prop changes (e.g. after an upload)', async () => {
    // why: the page bumps reloadToken after a completed upload so the freshly
    // uploaded (processing) photo shows up without a manual refresh.
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 });

    const { rerender } = render(<PhotoGallery reloadToken={0} />);
    await screen.findByText('beach.jpg');
    expect(api.listPhotos).toHaveBeenCalledTimes(1);

    rerender(<PhotoGallery reloadToken={1} />);
    await waitFor(() => expect(api.listPhotos).toHaveBeenCalledTimes(2));
  });

  it('keeps polling after a transient poll error (does not stop on the first failure)', async () => {
    // why: one flaky poll fetch must not silently freeze the table forever
    vi.useFakeTimers();
    vi.mocked(api.listPhotos)
      .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 }) // initial
      .mockRejectedValueOnce(new Error('transient')) // poll 1 fails
      .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 }) // poll 2 ok, still processing
      .mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 }); // poll 3 settles

    render(<PhotoGallery />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS * 3); });
    expect(api.listPhotos).toHaveBeenCalledTimes(4); // initial + 3 polls; the error did not abort polling

    vi.useRealTimers();
  });

  it('stops polling a never-settling status after the tick cap', async () => {
    // why: a stuck 'processing' (worker down) must not poll forever
    vi.useFakeTimers();
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [PROCESSING_PHOTO], totalCount: 1 });

    render(<PhotoGallery />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS * (GALLERY_POLL_MAX_TICKS + 10));
    });
    // initial + at most MAX_TICKS polls, not MAX_TICKS + 10
    expect(vi.mocked(api.listPhotos).mock.calls.length).toBeLessThanOrEqual(GALLERY_POLL_MAX_TICKS + 1);

    vi.useRealTimers();
  });

  it('stops polling after too many consecutive poll errors', async () => {
    // why: a persistently failing poll (backend down) must give up, not hammer forever
    vi.useFakeTimers();
    vi.mocked(api.listPhotos)
      .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 }) // initial
      .mockRejectedValue(new Error('down')); // every poll fails

    render(<PhotoGallery />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS * (GALLERY_POLL_MAX_ERRORS + 3));
    });
    // initial + exactly MAX_ERRORS failing polls, then it gave up
    expect(vi.mocked(api.listPhotos).mock.calls.length).toBe(1 + GALLERY_POLL_MAX_ERRORS);

    vi.useRealTimers();
  });

  it('drops a stale poll response after the query changed (no clobber)', async () => {
    // why: a poll tick in flight when the query changes must not overwrite the new view
    vi.useFakeTimers();
    let resolvePoll!: (v: { photos: PhotoAsset[]; totalCount: number }) => void;
    vi.mocked(api.listPhotos)
      .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 }) // initial (processing → polls)
      .mockImplementationOnce(() => new Promise((res) => { resolvePoll = res; })) // poll tick: in-flight
      .mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 }); // the new query's fetch

    render(<PhotoGallery />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // initial load
    await act(async () => { await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS); }); // poll tick fires (in-flight)

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'x' } }); // query change bumps generation
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // the new main fetch resolves (READY)

    await act(async () => {
      resolvePoll({ photos: [PROCESSING_PHOTO], totalCount: 999 }); // stale poll resolves late
      await Promise.resolve();
    });

    expect(screen.getByText('beach.jpg')).toBeInTheDocument(); // the new query's result stands
    expect(screen.queryByText('mountain.jpg')).toBeNull(); // stale response was dropped

    vi.useRealTimers();
  });

  it('shows an error in the detail dialog when getPhoto fails', async () => {
    // why: the modal must not open blank/silent on a failed detail fetch
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 });
    vi.mocked(api.getPhoto).mockRejectedValue(new Error('detail boom'));

    render(<PhotoGallery />);
    fireEvent.click(await screen.findByText('beach.jpg'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/boom|error|failed/i)).toBeTruthy();
  });
});
