import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';

vi.mock('@/lib/api', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  signUp: vi.fn(),
  logout: vi.fn()
}));

const USER = { userId: 'u1', email: 'a@b.co', displayName: 'Ada' };

function Probe() {
  const s = useSession();
  return (
    <div>
      status:{s.status};user:{s.user?.displayName ?? 'none'}
    </div>
  );
}
const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

beforeEach(() => {
  // Reset call history between tests (matches the convention used by sibling
  // specs, e.g. PhotoGallery.spec.tsx) — otherwise mock call counts accumulate
  // across `it` blocks in this file and calledTimes() assertions (e.g. the
  // mount-fetch and refresh tests) would count renders from earlier tests.
  vi.clearAllMocks();
  vi.mocked(api.getCurrentUser).mockResolvedValue(USER);
  vi.mocked(api.login).mockResolvedValue(USER);
  vi.mocked(api.signUp).mockResolvedValue(USER);
  vi.mocked(api.logout).mockResolvedValue(undefined);
});

describe('SessionProvider', () => {
  it('resolves to authenticated with the fetched user on mount', async () => {
    // why: one getCurrentUser fetch is the single source of the current user
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:authenticated;user:Ada')).toBeTruthy());
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('resolves to anonymous when getCurrentUser returns null', async () => {
    // why: signed-out boot must land on the login experience, not loading forever
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:anonymous;user:none')).toBeTruthy());
  });

  it('treats a failed session fetch as anonymous (no white-screen)', async () => {
    // why: design edge-state — a fetch error must degrade to /login, not crash
    vi.mocked(api.getCurrentUser).mockRejectedValue(new Error('boom'));
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:anonymous;user:none')).toBeTruthy());
  });

  it('login delegates to api.login and authenticates', async () => {
    // why: login flows through the context, not the page; delegation is the contract
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      await result.current.login('a@b.co', 'pw');
    });
    expect(api.login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('signUp delegates to api.signUp and authenticates', async () => {
    // why: sign-up is a session mutation like login, owned by the context
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      await result.current.signUp('a@b.co', 'pw', 'Ada');
    });
    expect(api.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw', displayName: 'Ada' });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('login rejects when the api fails (so the UI can show it)', async () => {
    // why: LoginScreen shows the inline error, so login must surface the failure
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    vi.mocked(api.login).mockRejectedValue(new Error('bad creds'));
    const { result } = renderHook(() => useSession(), { wrapper });
    await expect(result.current.login('a@b.co', 'x')).rejects.toThrow('bad creds');
  });

  it('logout delegates to api.logout and clears the session', async () => {
    // why: a shared logout is the whole point of the shared boundary
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      await result.current.logout();
    });
    expect(api.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });

  it('refresh re-fetches the current user', async () => {
    // why: mutations elsewhere can ask the context to re-sync
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      await result.current.refresh();
    });
    expect(api.getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('useSession throws outside a provider', () => {
    // why: misuse must fail loud, not read a stale/undefined session
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});
