import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { LoginScreen } from '@/components/auth/LoginScreen';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
const login = vi.fn();
const signUp = vi.fn();
beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  signUp.mockReset().mockResolvedValue(undefined);
  vi.mocked(session.useSession).mockReturnValue({
    user: null,
    status: 'anonymous',
    login,
    signUp,
    logout: vi.fn(),
    refresh: vi.fn()
  });
});

describe('LoginScreen', () => {
  it('logs in with the entered credentials', async () => {
    // why: login submits through the session context, not lib/api directly
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/^e-?mail$/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.co', 'pw'));
  });

  it('signs up with display name, email and password', async () => {
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/sign-?up e-?mail/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/sign-?up password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith('a@b.co', 'pw', 'Ada'));
  });

  it('shows an inline error when login fails', async () => {
    // why: bad credentials must surface, not fail silently
    login.mockRejectedValue(new Error('bad creds'));
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/^e-?mail$/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/bad creds/i);
  });

  it('shows an inline error when sign-up fails', async () => {
    // why: a failed sign-up (e.g. email taken) must surface on its own form
    signUp.mockRejectedValue(new Error('email taken'));
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/sign-?up e-?mail/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/sign-?up password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/email taken/i);
  });
});
