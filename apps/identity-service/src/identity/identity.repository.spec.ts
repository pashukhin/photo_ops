import { describe, expect, it, vi } from 'vitest';
import { IdentityRepository } from './identity.repository';

describe('IdentityRepository', () => {
  it('creates the user and password credential in one transaction', async () => {
    const returning = vi.fn().mockResolvedValue([
      { id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date('2026-06-22T00:00:00.000Z'), updatedAt: new Date('2026-06-22T00:00:00.000Z') }
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const tx = { insert: vi.fn().mockReturnValue({ values }) };
    const db = {
      insert: vi.fn(),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
    };
    const repository = new IdentityRepository(db as never);

    await repository.createUserWithPassword({ email: 'person@example.com', passwordHash: 'hash:secret123', displayName: 'Person' });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });
});
