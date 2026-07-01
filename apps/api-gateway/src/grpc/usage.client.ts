import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

export interface UsageLine {
  eventType: string;
  resourceType: string;
  totalQuantity: number;
  unit: string;
}

export interface UsageSummaryDto {
  lines: UsageLine[];
  estimatedMonthlyCost: string;
  currency: string;
}

export interface UsageEventLineDto {
  occurredAt: string;
  eventType: string;
  resourceType: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  amount: string;
  currency: string;
  sourceEntityType: string;
  sourceEntityId: string;
}

export interface UsageEventsDto {
  lines: UsageEventLineDto[];
  totalCount: number;
  filteredTotalAmount: string;
  currency: string;
}

export interface ListUsageEventsInput {
  userId: string;
  occurredFrom: string;
  occurredTo: string;
  resourceType: string;
  eventType: string;
  page: number;
  pageSize: number;
}

export interface UsageGatewayClient {
  getUsageSummary(userId: string): Promise<UsageSummaryDto>;
  listUsageEvents(input: ListUsageEventsInput): Promise<UsageEventsDto>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcUsageServiceClient {
  GetUsageSummary(input: { userId: string }, callback: Callback<UsageSummaryDto>): void;
  ListUsageEvents(input: ListUsageEventsInput, callback: Callback<UsageEventsDto>): void;
}

@Injectable()
export class UsageClient implements UsageGatewayClient {
  private readonly client: GrpcUsageServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/usage/v1/usage_service.proto');
    const packageDefinition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: Number,
      defaults: true,
      oneofs: true,
      includeDirs: [join(process.cwd(), '../../proto')]
    });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: { usage: { v1: { UsageService: new (target: string, channelCredentials: ChannelCredentials) => GrpcUsageServiceClient } } };
    };
    const target = process.env.USAGE_SERVICE_GRPC_URL ?? 'usage-service:50056';
    this.client = new loaded.photoops.usage.v1.UsageService(target, credentials.createInsecure());
  }

  getUsageSummary(userId: string): Promise<UsageSummaryDto> {
    return new Promise((resolve, reject) => {
      this.client.GetUsageSummary({ userId }, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  listUsageEvents(input: ListUsageEventsInput): Promise<UsageEventsDto> {
    return new Promise((resolve, reject) => {
      this.client.ListUsageEvents(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }
}
