import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicPostPage from './page';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({ getPublicPost: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  })
}));

const dto = {
  slug: 'tok',
  title: 'Trip',
  body: 'day one',
  locationLabel: '',
  dateFrom: '2024-06-15T10:00:00.000Z',
  dateTo: '2024-06-15T10:05:00.000Z',
  publishedAt: '2026-07-06T00:00:00.000Z',
  photos: [
    { order: 0, caption: 'first', variants: [{ variantType: 'thumbnail', url: 'http://img/p1', width: 40, height: 40 }] },
    // a photo with no resolved variant + no caption exercises the empty branches
    { order: 1, caption: '', variants: [] }
  ]
};

describe('PublicPostPage', () => {
  it('renders a published post (title, body, variant image) for its slug', async () => {
    // why: anonymous SSR resolves the slug to the public DTO and renders variant
    // images (never originals).
    vi.mocked(api.getPublicPost).mockResolvedValue(dto as never);
    render(await PublicPostPage({ params: Promise.resolve({ id: 'tok' }) }));
    expect(api.getPublicPost).toHaveBeenCalledWith('tok');
    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.getByText('day one')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'first' }).getAttribute('src')).toBe('http://img/p1');
  });

  it('calls notFound() (→404, not 500) when the slug has no published post', async () => {
    vi.mocked(api.getPublicPost).mockResolvedValue(null as never);
    await expect(PublicPostPage({ params: Promise.resolve({ id: 'ghost' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
