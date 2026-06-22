import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

function createController() {
  const identityClient = { signUp: vi.fn(), login: vi.fn(), logout: vi.fn(), getCurrentUser: vi.fn() };
  const authService = { readSessionId: vi.fn(), requireSession: vi.fn() };
  const response = { setHeader: vi.fn() };
  return { controller: new AuthController(identityClient as never, authService as never), identityClient, authService, response };
}

describe('AuthController', () => {
  it('sets a session cookie after signup', async () => {
    const { controller, identityClient, response } = createController();
    identityClient.signUp.mockResolvedValue({ sessionId: 'session-1', userId: 'user-1', email: 'person@example.com', displayName: 'Person', expiresAt: '2026-07-06T00:00:00.000Z' });

    await expect(controller.signUp({ email: 'person@example.com', password: 'secret123', displayName: 'Person' }, response as never)).resolves.toEqual({ userId: 'user-1', email: 'person@example.com', displayName: 'Person' });
    expect(response.setHeader).toHaveBeenCalledWith('set-cookie', expect.stringContaining('photoops_session=session-1'));
  });

  it('clears a session cookie after logout', async () => {
    const { controller, identityClient, authService, response } = createController();
    authService.readSessionId.mockReturnValue('session-1');
    identityClient.logout.mockResolvedValue({});

    await expect(controller.logout('photoops_session=session-1', response as never)).resolves.toEqual({ ok: true });
    expect(identityClient.logout).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(response.setHeader).toHaveBeenCalledWith('set-cookie', expect.stringContaining('Expires=Thu, 01 Jan 1970'));
  });
});
