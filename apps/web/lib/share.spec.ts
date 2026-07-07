import { describe, expect, it } from 'vitest';
import { canonicalPostUrl, shareText, shortDescription } from './share';

// WEB_ORIGIN falls back to the code default in tests (env unset) — deterministic.
describe('share helpers', () => {
  it('canonicalPostUrl builds an absolute /posts/<slug> URL', () => {
    // why: the shared link must be absolute so it works when pasted elsewhere.
    expect(canonicalPostUrl('AbC12xY')).toBe('http://localhost:3000/posts/AbC12xY');
  });

  it('shortDescription passes a short single-line body through unchanged', () => {
    expect(shortDescription('Three days by the sea')).toBe('Three days by the sea');
  });

  it('shortDescription collapses newlines to a single line', () => {
    // why: the share text and og:description are single-line; a multi-line body
    // must not inject raw newlines into them.
    expect(shortDescription('line one\nline two')).toBe('line one line two');
  });

  it('shortDescription truncates past max with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = shortDescription(long, 140);
    expect(out.length).toBeLessThanOrEqual(141); // 140 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });

  it('shortDescription does not truncate a body exactly at max', () => {
    // why: off-by-one guard on the truncation boundary.
    const exact = 'x'.repeat(140);
    expect(shortDescription(exact, 140)).toBe(exact);
  });

  it('shortDescription counts by code points — an all-emoji body within max is not truncated', () => {
    // why: guard + truncation both by code point; a 100-emoji body (200 UTF-16
    // units) must NOT get a spurious ellipsis, and no surrogate is ever split.
    const emoji = '😀'.repeat(100);
    expect(shortDescription(emoji, 140)).toBe(emoji);
  });

  it('shortDescription returns empty string for an empty body', () => {
    expect(shortDescription('')).toBe('');
    expect(shortDescription('   ')).toBe('');
  });

  it('shareText renders title + short desc + link', () => {
    // why: the exact template DoD 13 specifies.
    expect(shareText({ title: 'Summer Crimea', body: 'Three days by the sea', slug: 'AbC12xY' })).toBe(
      'New photo story: Summer Crimea\nThree days by the sea\nhttp://localhost:3000/posts/AbC12xY'
    );
  });

  it('shareText omits the description line when the body is empty', () => {
    // why: no blank desc line for a photo-only post.
    expect(shareText({ title: 'Summer Crimea', body: '', slug: 'AbC12xY' })).toBe(
      'New photo story: Summer Crimea\nhttp://localhost:3000/posts/AbC12xY'
    );
  });

  it('shareText falls back to "Untitled story" for an empty title', () => {
    expect(shareText({ title: '', body: '', slug: 'AbC12xY' })).toBe(
      'New photo story: Untitled story\nhttp://localhost:3000/posts/AbC12xY'
    );
  });
});
