import { status as GrpcStatus } from '@grpc/grpc-js';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsageClient } from '../grpc/usage.client';
import { UsageController } from './usage.controller';

const SUMMARY = {
  lines: [
    { eventType: 'photo_original_stored', resourceType: 'storage', totalQuantity: 12345, unit: 'byte' },
    { eventType: 'photo_processed', resourceType: 'processing', totalQuantity: 1, unit: 'operation' }
  ],
  estimatedMonthlyCost: '0.37',
  currency: 'USD'
};

function createController() {
  const usageClient = {
    getUsageSummary: vi.fn()
  } as unknown as UsageClient;
  const authService = { requireSession: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
  return { controller: new UsageController(usageClient, authService as never), usageClient, authService };
}

describe('UsageController', () => {
  it('returns the usage summary for the authenticated user', async () => {
    const { controller, usageClient } = createController();
    vi.mocked(usageClient.getUsageSummary).mockResolvedValue(SUMMARY);

    const result = await controller.getUsageSummary('photoops_session=session-1');

    expect(usageClient.getUsageSummary).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(SUMMARY);
  });

  it('rejects unauthenticated requests with 401 (UnauthorizedException)', async () => {
    const { controller, authService } = createController();
    vi.mocked(authService.requireSession).mockRejectedValue(new UnauthorizedException('authentication required'));

    await expect(controller.getUsageSummary(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes the authenticated userId from the session to the usage client', async () => {
    const { controller, usageClient, authService } = createController();
    vi.mocked(authService.requireSession).mockResolvedValue({ userId: 'user-42', email: 'u@example.com', sessionId: 's', displayName: 'U', expiresAt: '' });
    vi.mocked(usageClient.getUsageSummary).mockResolvedValue(SUMMARY);

    await controller.getUsageSummary('photoops_session=session-42');

    expect(usageClient.getUsageSummary).toHaveBeenCalledWith('user-42');
  });

  it('propagates gRPC errors from the usage client', async () => {
    const { controller, usageClient } = createController();
    const grpcError = Object.assign(new Error('internal'), { code: GrpcStatus.INTERNAL });
    vi.mocked(usageClient.getUsageSummary).mockRejectedValue(grpcError);

    await expect(controller.getUsageSummary('photoops_session=session-1')).rejects.toMatchObject({ code: GrpcStatus.INTERNAL });
  });
});
