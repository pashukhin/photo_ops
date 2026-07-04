import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { AuthGuard } from '@/components/shell/AuthGuard';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

function mockStatus(status: session.SessionStatus) {
  vi.mocked(session.useSession).mockReturnValue({
    user: status === 'authenticated' ? { userId: 'u', email: 'e', displayName: 'Ada' } : null,
    status,
    login: vi.fn(),
    signUp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn()
  });
}
beforeEach(() => replace.mockReset());

describe('AuthGuard', () => {
  it('renders children when authenticated', () => {
    mockStatus('authenticated');
    render(
      <AuthGuard>
        <p>secret</p>
      </AuthGuard>
    );
    expect(screen.getByText('secret')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /login and hides children when anonymous', async () => {
    // why: guarded sections must never render for a signed-out visitor
    mockStatus('anonymous');
    render(
      <AuthGuard>
        <p>secret</p>
      </AuthGuard>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('shows neither children nor a redirect while loading', () => {
    // why: don't flash /login before the session resolves
    mockStatus('loading');
    render(
      <AuthGuard>
        <p>secret</p>
      </AuthGuard>
    );
    expect(screen.queryByText('secret')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
