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
    getUsageSummary: vi.fn(),
    listUsageEvents: vi.fn()
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

  const EMPTY_EVENTS = { lines: [], totalCount: 0, filteredTotalAmount: '0.00', currency: 'USD' };

  it('maps the events query to ListUsageEventsInput with the authenticated userId', async () => {
    // why: the filter query (date range, resource/event type, pagination) maps to
    // the gRPC input; userId comes from the validated session, not the query.
    const { controller, usageClient } = createController();
    vi.mocked(usageClient.listUsageEvents).mockResolvedValue(EMPTY_EVENTS);

    await controller.listUsageEvents('photoops_session=session-1', {
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
      resource_type: 'storage',
      event_type: 'photo_processed',
      page: '2',
      page_size: '50'
    });

    expect(usageClient.listUsageEvents).toHaveBeenCalledWith({
      userId: 'user-1',
      occurredFrom: '2026-01-01T00:00:00Z',
      occurredTo: '2026-02-01T00:00:00Z',
      resourceType: 'storage',
      eventType: 'photo_processed',
      page: 2,
      pageSize: 50
    });
  });

  it('defaults empty events query fields (empty filters; page/pageSize 0 → server clamps)', async () => {
    // why: absent filters become empty strings / 0; the server applies page→1 and
    // page_size→25. The gateway does not invent defaults.
    const { controller, usageClient } = createController();
    vi.mocked(usageClient.listUsageEvents).mockResolvedValue(EMPTY_EVENTS);

    await controller.listUsageEvents('photoops_session=session-1', {});

    expect(usageClient.listUsageEvents).toHaveBeenCalledWith({
      userId: 'user-1',
      occurredFrom: '',
      occurredTo: '',
      resourceType: '',
      eventType: '',
      page: 0,
      pageSize: 0
    });
  });

  it('rejects unauthenticated events requests with 401', async () => {
    // why: the events report is session-scoped like the summary.
    const { controller, authService } = createController();
    vi.mocked(authService.requireSession).mockRejectedValue(new UnauthorizedException('authentication required'));

    await expect(controller.listUsageEvents(undefined, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
