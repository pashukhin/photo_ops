import { describe, expect, it, vi } from 'vitest';
import { IdentityDomainService } from './identity.service';

function createService(now = new Date('2026-06-22T00:00:00.000Z')) {
  const repository = {
    createUserWithPassword: vi.fn(),
    findUserByEmail: vi.fn(),
    findPasswordHash: vi.fn(),
    createSession: vi.fn(),
    findSessionWithUser: vi.fn(),
    revokeSession: vi.fn()
  };
  const passwords = {
    hash: vi.fn((password: string) => Promise.resolve(`hash:${password}`)),
    verify: vi.fn((hash: string, password: string) => Promise.resolve(hash === `hash:${password}`))
  };
  return { service: new IdentityDomainService(repository, passwords, () => now), repository, passwords };
}

describe('IdentityDomainService', () => {
  it('normalizes email during signup and creates a session', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue(null);
    repository.createUserWithPassword.mockResolvedValue({ id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    repository.createSession.mockResolvedValue({ id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-07-06T00:00:00.000Z'), createdAt: new Date(), revokedAt: null });

    const result = await service.signUp({ email: ' Person@Example.COM ', password: 'secret123', displayName: 'Person' });

    expect(repository.findUserByEmail).toHaveBeenCalledWith('person@example.com');
    expect(repository.createUserWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', passwordHash: 'hash:secret123', displayName: 'Person' });
    expect(result.session.id).toBe('session-1');
  });

  it('rejects duplicate signup email', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue({ id: 'user-1' });

    await expect(service.signUp({ email: 'person@example.com', password: 'secret123', displayName: 'Person' })).rejects.toThrow('email already exists');
  });

  it('rejects invalid login credentials without revealing which field failed', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue(null);

    await expect(service.login({ email: 'missing@example.com', password: 'secret123' })).rejects.toThrow('invalid credentials');
  });

  it('rejects disabled user login', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue({ id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'disabled', createdAt: new Date(), updatedAt: new Date() });

    await expect(service.login({ email: 'person@example.com', password: 'secret123' })).rejects.toThrow('user disabled');
  });

  it('rejects expired sessions', async () => {
    const { service, repository } = createService(new Date('2026-06-22T00:00:00.000Z'));
    repository.findSessionWithUser.mockResolvedValue({
      session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-06-21T00:00:00.000Z'), createdAt: new Date(), revokedAt: null },
      user: { id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date(), updatedAt: new Date() }
    });

    await expect(service.validateSession('session-1')).rejects.toThrow('invalid session');
  });

  it('rejects revoked sessions', async () => {
    const { service, repository } = createService();
    repository.findSessionWithUser.mockResolvedValue({
      session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-07-01T00:00:00.000Z'), createdAt: new Date(), revokedAt: new Date() },
      user: { id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date(), updatedAt: new Date() }
    });

    await expect(service.validateSession('session-1')).rejects.toThrow('invalid session');
  });
});
