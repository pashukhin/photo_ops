import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from './layout';

vi.mock('@/lib/session', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <div data-session-provider>{children}</div>
}));

describe('RootLayout', () => {
  it('wraps children in the SessionProvider', () => {
    // why: one provider at the root is the single source of the current user
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>child</p>
      </RootLayout>
    );
    expect(html).toContain('data-session-provider');
    expect(html).toContain('child');
  });
});
