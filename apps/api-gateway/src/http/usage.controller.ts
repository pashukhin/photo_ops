import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UsageClient } from '../grpc/usage.client';

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
}
