import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicPost } from '@/lib/api';
import type { PublicPostPhoto } from '@/lib/api';

// Text Open Graph + Twitter meta so a shared link previews with title + description
// (session 020, D4). No og:image (deferred, photo_ops-278). GREEN wires a React
// cache()-wrapped getPublicPost shared with the page + a safe 404 branch.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  throw new Error(`not implemented: ${id}`);
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
  const post = await getPublicPost(slug);
  if (!post) {
    // A missing/unpublished/private slug is a 404 — NOT a 500. A backend failure
    // (getPublicPost throws) propagates to the error boundary instead.
    notFound();
  }

  const range = dateRange(post.dateFrom, post.dateTo);

  return (
    <article className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{post.title || 'Untitled story'}</h1>
        {(range || post.locationLabel) && (
          <p className="text-sm text-muted-foreground">
            {[post.locationLabel, range].filter(Boolean).join(' · ')}
          </p>
        )}
      </header>

      {post.body ? <p className="whitespace-pre-wrap leading-relaxed">{post.body}</p> : null}

      <div className="space-y-6">
        {post.photos.map((photo, index) => {
          const url = variantUrl(photo);
          return (
            <figure key={index} className="space-y-1">
              {url ? (
                <img src={url} alt={photo.caption || `Photo ${index + 1}`} className="w-full rounded-md" />
              ) : null}
              {photo.caption ? (
                <figcaption className="text-sm text-muted-foreground">{photo.caption}</figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
    </article>
  );
}
