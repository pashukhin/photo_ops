// Pure share helpers (session 020). WEB_ORIGIN is build-time-inlined by next build;
// the code default is the effective value (see design D1). No window / no I/O.
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000';

export function canonicalPostUrl(slug: string): string {
  throw new Error(`not implemented: ${WEB_ORIGIN} ${slug}`);
}

export function shortDescription(body: string, max = 140): string {
  throw new Error(`not implemented: ${body.length} ${max}`);
}

export function shareText(input: { title: string; body: string; slug: string }): string {
  throw new Error(`not implemented: ${input.slug}`);
}
