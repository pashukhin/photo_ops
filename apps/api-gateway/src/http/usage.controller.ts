import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UsageClient, UsageEventsDto } from '../grpc/usage.client';

export interface UsageEventsQuery {
  from?: string;
  to?: string;
  resource_type?: string;
  event_type?: string;
  page?: string;
  page_size?: string;
}

@Controller('v1/usage')
export class UsageController {
  constructor(
    private readonly usageClient: UsageClient,
    private readonly authService: AuthService
  ) {}

  @Get('summary')
  async getUsageSummary(@Headers('cookie') cookieHeader: string | undefined) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.usageClient.getUsageSummary(auth.userId);
  }

  @Get('events')
  async listUsageEvents(
    @Headers('cookie') cookieHeader: string | undefined,
    @Query() query: UsageEventsQuery
  ): Promise<UsageEventsDto> {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.usageClient.listUsageEvents({
      userId: auth.userId,
      occurredFrom: query.from ?? '',
      occurredTo: query.to ?? '',
      resourceType: query.resource_type ?? '',
      eventType: query.event_type ?? '',
      page: query.page !== undefined ? Number(query.page) : 0,
      pageSize: query.page_size !== undefined ? Number(query.page_size) : 0
    });
  }
}
