// Pure share helpers (session 020). WEB_ORIGIN is build-time-inlined by next build;
// the code default is the effective value (see design D1). No window / no I/O.
// The one canonical public origin — also used server-side for og:url/metadataBase.
export const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000';

// The canonical, absolute public URL of a published post (stable/immutable slug).
export function canonicalPostUrl(slug: string): string {
  return `${WEB_ORIGIN}/posts/${slug}`;
}

// A single-line, length-bounded summary of a post body for the share text and
// og:description. Collapses whitespace; empty when the body is blank; appends an
// ellipsis only when it actually truncates.
export function shortDescription(body: string, max = 140): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  // Count AND truncate by code points (not UTF-16 units), so an emoji at the
  // boundary is never split into a lone surrogate, and a body that fits in `max`
  // code points is never given a spurious ellipsis.
  const cps = [...oneLine];
  return cps.length > max ? `${cps.slice(0, max).join('')}…` : oneLine;
}

// The generated share text: `New photo story: <title>\n<short desc>\n<link>`.
// The description line is omitted when the body is blank; title falls back.
export function shareText(input: { title: string; body: string; slug: string }): string {
  const desc = shortDescription(input.body);
  const lines = [`New photo story: ${input.title || 'Untitled story'}`];
  if (desc) lines.push(desc);
  lines.push(canonicalPostUrl(input.slug));
  return lines.join('\n');
}
