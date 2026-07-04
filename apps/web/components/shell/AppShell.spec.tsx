import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { AppShell } from '@/components/shell/AppShell';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
const usePathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }));

const logout = vi.fn();
beforeEach(() => {
  logout.mockReset();
  usePathname.mockReturnValue('/photos');
  vi.mocked(session.useSession).mockReturnValue({
    user: { userId: 'u1', email: 'a@b.co', displayName: 'Ada' },
    status: 'authenticated',
    login: vi.fn(),
    signUp: vi.fn(),
    logout,
    refresh: vi.fn()
  });
});

describe('AppShell', () => {
  it('renders the three nav links with their hrefs', () => {
    // why: Clusters was unreachable before; the shell must expose all three
    render(
      <AppShell>
        <p>section</p>
      </AppShell>
    );
    expect(screen.getByRole('link', { name: 'Photos' })).toHaveAttribute('href', '/photos');
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute('href', '/clusters');
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('href', '/usage');
  });

  it('marks the active route with aria-current=page', () => {
    // why: active-state is the nav's core feedback; pinned as an a11y contract
    usePathname.mockReturnValue('/clusters');
    render(
      <AppShell>
        <p>section</p>
      </AppShell>
    );
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Photos' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('shows the display name and renders children', () => {
    render(
      <AppShell>
        <p>section-body</p>
      </AppShell>
    );
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('section-body')).toBeTruthy();
  });

  it('logs out via the session when Log out is clicked', async () => {
    // why: the shell is the one place a logged-in user can sign out anywhere
    render(
      <AppShell>
        <p>section</p>
      </AppShell>
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
