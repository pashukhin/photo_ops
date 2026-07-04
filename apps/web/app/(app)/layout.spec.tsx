import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppLayout from './layout';

vi.mock('@/components/shell/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: ReactNode }) => <div data-guard>{children}</div>
}));
vi.mock('@/components/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-shell>{children}</div>
}));

describe('(app) layout', () => {
  it('wraps children in the guard then the shell', () => {
    // why: the guard must sit OUTSIDE the shell so anonymous users never see it
    const { container } = render(
      <AppLayout>
        <p>body</p>
      </AppLayout>
    );
    expect(container.querySelector('[data-guard] [data-shell]')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });
});
