import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicPost } from '@/lib/api';
import type { PublicPostPhoto } from '@/lib/api';
import { WEB_ORIGIN, canonicalPostUrl, shortDescription } from '@/lib/share';

// generateMetadata and the page both need the post; cache() dedupes the fetch
// within one request (no memo outside a render — harmless for the unit tests).
const getPublicPostCached = cache(getPublicPost);

// Text Open Graph + Twitter meta so a shared link previews with title + description
// (session 020, D4). No og:image (deferred, photo_ops-278). A missing/unpublished
// slug returns a safe object (the page component 404s — never throws here).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: slug } = await params;
  const post = await getPublicPostCached(slug);
  if (!post) {
    return { title: 'Story not found' };
  }
  const title = post.title || 'Untitled story';
  const description = shortDescription(post.body);
  return {
    title: `${title} · Photo Ops`,
    description,
    metadataBase: new URL(WEB_ORIGIN),
    openGraph: { title, description, url: canonicalPostUrl(slug), type: 'article' },
    twitter: { card: 'summary' }
  };
}

// Public, anonymous, server-rendered post page (session 019). Lives OUTSIDE the
// (app) route group, so it never touches AuthGuard/AppShell — no session. Photos
// render via prepared VARIANT urls (never originals). Rendered dynamically because
// variant urls are short-lived presigned GETs (fresh per request; no static cache).
export const dynamic = 'force-dynamic';

function variantUrl(photo: PublicPostPhoto): string | null {
  // Prefer the larger 'preview' rendition, fall back to any variant (thumbnail).
  const chosen = photo.variants.find((v) => v.variantType === 'preview') ?? photo.variants[0];
  return chosen?.url ?? null;
}

function dateRange(from: string, to: string): string | null {
  const fmt = (iso: string) => (iso ? iso.slice(0, 10) : '');
  const a = fmt(from);
  const b = fmt(to);
  if (!a && !b) return null;
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || b;
}

// NOTE: the dynamic segment is named `[id]` (not `[slug]`) to stay consistent
// with the sibling editor route `/(app)/posts/[id]/edit` — Next.js forbids two
// different param names at the same path position. The value IS the opaque slug.
export default async function PublicPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const post = await getPublicPostCached(slug);
  if (!post) {
    // A missing/unpublished/private slug is a 404 — NOT a 500. A backend failure
    // (getPublicPost throws) propagates to the error boundary instead.
    notFound();
  }

  const range = dateRange(post.dateFrom, post.dateTo);
  const meta = [post.locationLabel, range].filter(Boolean).join(' · ');

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-4">
          <a href="/" className="text-sm font-semibold tracking-tight">
            Photo Ops
          </a>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-2xl px-4 py-12 space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              {post.title || 'Untitled story'}
            </h1>
            {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
          </header>

          {post.body ? (
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-foreground/90">{post.body}</p>
          ) : null}

          {post.photos.length > 0 ? (
            <div className="space-y-8">
              {post.photos.map((photo, index) => {
                const url = variantUrl(photo);
                return (
                  <figure key={index} className="space-y-2">
                    {url ? (
                      <img
                        src={url}
                        alt={photo.caption || `Photo ${index + 1}`}
                        className="w-full rounded-lg shadow-sm"
                      />
                    ) : null}
                    {photo.caption ? (
                      <figcaption className="text-sm text-muted-foreground">{photo.caption}</figcaption>
                    ) : null}
                  </figure>
                );
              })}
            </div>
          ) : null}
        </article>
      </main>

      <footer role="contentinfo" className="border-t">
        <div className="mx-auto max-w-2xl px-4 py-8 text-sm text-muted-foreground">
          Published on Photo Ops
        </div>
      </footer>
    </div>
  );
}
