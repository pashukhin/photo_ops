import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PostEditor } from './PostEditor';

vi.mock('../../lib/api', () => ({ getPost: vi.fn(), updatePost: vi.fn(), listPhotos: vi.fn() }));

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

  it('shows an error when the post cannot be loaded (404 / not owned)', async () => {
    // why: an unauthorized/missing draft must surface a message, not a blank page.
    vi.mocked(api.getPost).mockRejectedValue(new Error('GetPost failed: 404'));
    render(<PostEditor postId="ghost" />);
    await screen.findByText(/404|could not|not found/i);
  });
});
