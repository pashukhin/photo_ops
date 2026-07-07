import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PostsList } from './PostsList';

vi.mock('../../lib/api', () => ({ listPosts: vi.fn() }));

const summary = (over = {}) => ({
  id: 'post-1',
  title: 'Trip',
  status: 'published',
  visibility: 'public',
  dateFrom: '2024-06-15T10:00:00.000Z',
  dateTo: '2024-06-15T10:05:00.000Z',
  photoCount: 2,
  createdAt: 'c',
  updatedAt: 'u',
  ...over
});

describe('PostsList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the owner posts with a status and an edit link', async () => {
    // why: after publishing, the owner needs a way back to a post.
    vi.mocked(api.listPosts).mockResolvedValue({ posts: [summary()] } as never);
    render(<PostsList />);
    expect(await screen.findByText('Trip')).toBeTruthy();
    expect(screen.getByText(/published/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /trip|edit|open/i }).getAttribute('href')).toBe('/posts/post-1/edit');
  });

  it('shows an empty state when there are no posts', async () => {
    vi.mocked(api.listPosts).mockResolvedValue({ posts: [] } as never);
    render(<PostsList />);
    expect(await screen.findByText(/no posts|nothing here|create/i)).toBeTruthy();
  });

  it('shows a loading affordance before the fetch resolves', async () => {
    // why: 100% diff-cover — the loading branch must be exercised.
    let resolve!: (v: unknown) => void;
    vi.mocked(api.listPosts).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<PostsList />);
    expect(screen.getByRole('status')).toBeTruthy();
    resolve({ posts: [] });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('surfaces a load error', async () => {
    // why: 100% diff-cover — the error branch must be exercised.
    vi.mocked(api.listPosts).mockRejectedValue(new Error('list boom'));
    render(<PostsList />);
    expect(await screen.findByText(/list boom|could not|failed/i)).toBeTruthy();
  });
});
