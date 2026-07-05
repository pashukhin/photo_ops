import { describe, expect, it } from 'vitest';
import { FALLBACK, fmt, fmtBytes, fmtDimensions } from './format';

describe('gallery format helpers', () => {
  it('fmt falls back for empty/nullish and stringifies otherwise', () => {
    // why: an absent attribute renders the em-dash fallback, not a blank cell
    expect(fmt('')).toBe(FALLBACK);
    expect(fmt(null)).toBe(FALLBACK);
    expect(fmt(undefined)).toBe(FALLBACK);
    expect(fmt(42)).toBe('42');
  });

  it('fmtBytes renders human units and falls back on non-numeric', () => {
    // why: raw byte counts are unreadable; show B/KB/MB
    expect(fmtBytes(undefined)).toBe(FALLBACK);
    expect(fmtBytes('512')).toBe('512 B');
    expect(fmtBytes('2048')).toBe('2.0 KB');
    expect(fmtBytes(String(3 * 1024 * 1024))).toBe('3.0 MB');
  });

  it('fmtDimensions needs both sides', () => {
    // why: a single dimension is meaningless; require width and height
    expect(fmtDimensions(undefined, 3)).toBe(FALLBACK);
    expect(fmtDimensions(4000, 3000)).toBe('4000×3000');
  });
});
