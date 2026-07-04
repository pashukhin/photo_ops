import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import LoginPage from './page';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
vi.mock('@/components/auth/LoginScreen', () => ({ LoginScreen: () => <div>login-screen</div> }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

function mockStatus(status: session.SessionStatus) {
  vi.mocked(session.useSession).mockReturnValue({
    user: null,
    status,
    login: vi.fn(),
    signUp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn()
  });
}
beforeEach(() => replace.mockReset());

describe('LoginPage', () => {
  it('renders the login screen for an anonymous visitor', () => {
    mockStatus('anonymous');
    render(<LoginPage />);
    expect(screen.getByText('login-screen')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects an already-authenticated visitor to /photos', async () => {
    // why: a logged-in user should never sit on /login
    mockStatus('authenticated');
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/photos'));
  });
});
