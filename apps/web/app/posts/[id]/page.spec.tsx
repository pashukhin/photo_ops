import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicPostPage, { generateMetadata } from './page';
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

describe('PublicPostPage generateMetadata (session 020)', () => {
  it('emits text OG + twitter meta for a found post', async () => {
    // why: a pasted link previews with the post's title + description.
    vi.mocked(api.getPublicPost).mockResolvedValue(dto as never);
    const md = await generateMetadata({ params: Promise.resolve({ id: 'tok' }) });
    expect(md.title).toBe('Trip · Photo Ops');
    expect(md.description).toBe('day one');
    expect(md.openGraph?.title).toBe('Trip');
    expect(md.openGraph?.description).toBe('day one');
    expect((md.openGraph as { url?: string }).url).toBe('http://localhost:3000/posts/tok');
    expect((md.openGraph as { type?: string }).type).toBe('article');
    expect((md.twitter as { card?: string }).card).toBe('summary');
  });

  it('returns a safe object (no throw) for a 404 slug', async () => {
    // why: generateMetadata must not 500 the page; the page component 404s.
    vi.mocked(api.getPublicPost).mockResolvedValue(null as never);
    const md = await generateMetadata({ params: Promise.resolve({ id: 'ghost' }) });
    expect(md.title).toBe('Story not found');
  });
});

describe('PublicPostPage polish (session 020)', () => {
  it('renders a footer landmark', async () => {
    // why: D5 adds a header/footer frame to the share destination.
    vi.mocked(api.getPublicPost).mockResolvedValue(dto as never);
    render(await PublicPostPage({ params: Promise.resolve({ id: 'tok' }) }));
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});
