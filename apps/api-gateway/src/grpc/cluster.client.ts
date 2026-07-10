import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

// Raw gRPC shapes (proto-loader: camelCase keys, numeric enums). The controller
// maps enums to strings and shapes the browser-facing DTO.
export interface GenerateClustersInput {
  userId: string;
  scope: string;
  method: string;
  paramsJson: string;
}

export interface GenerateClustersResult {
  resultId: string;
  status: number;
}

export interface ClusterItemRaw {
  photoId: string;
}

export interface ClusterNodeRaw {
  id: string;
  kind: number;
  mergeDistance: number;
  dateFrom: string;
  dateTo: string;
  photoCount: number;
  coverPhotoId: string;
  segmentLabel: string;
  children: ClusterNodeRaw[];
  items: ClusterItemRaw[];
}

export interface ClusteringResultRaw {
  id: string;
  userId: string;
  method: string;
  paramsJson: string;
  inputFingerprint: string;
  status: number;
  errorMessage: string;
  createdAt: string;
  root?: ClusterNodeRaw;
}

export interface ClusteringResultSummaryRaw {
  id: string;
  method: string;
  status: number;
  photoCount: number;
  dateFrom: string;
  dateTo: string;
  createdAt: string;
}

export interface ClusteringMethodDescriptorRaw {
  id: string;
  displayName: string;
  description: string;
  requiredPhotoFields: string[];
  defaultParamsJson: string;
}

export interface GetClusteringResultInput {
  resultId: string;
  userId: string;
}

export interface DeleteClusteringResultInput {
  resultId: string;
  userId: string;
}

export interface ClusterGatewayClient {
  generateClusters(input: GenerateClustersInput): Promise<GenerateClustersResult>;
  getClusteringResult(input: GetClusteringResultInput): Promise<ClusteringResultRaw>;
  listClusteringResults(userId: string): Promise<{ results: ClusteringResultSummaryRaw[] }>;
  listClusteringMethods(): Promise<{ methods: ClusteringMethodDescriptorRaw[] }>;
  deleteClusteringResult(input: DeleteClusteringResultInput): Promise<Record<string, never>>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcClusterServiceClient {
  GenerateClusters(input: GenerateClustersInput, callback: Callback<GenerateClustersResult>): void;
  GetClusteringResult(input: GetClusteringResultInput, callback: Callback<ClusteringResultRaw>): void;
  ListClusteringResults(
    input: { userId: string },
    callback: Callback<{ results: ClusteringResultSummaryRaw[] }>
  ): void;
  ListClusteringMethods(
    input: Record<string, never>,
    callback: Callback<{ methods: ClusteringMethodDescriptorRaw[] }>
  ): void;
  DeleteClusteringResult(
    input: DeleteClusteringResultInput,
    callback: Callback<Record<string, never>>
  ): void;
}

@Injectable()
export class ClusterClient implements ClusterGatewayClient {
  private readonly client: GrpcClusterServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/cluster/v1/cluster_service.proto');
    const packageDefinition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: Number,
      defaults: true,
      oneofs: true,
      includeDirs: [join(process.cwd(), '../../proto')]
    });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: {
        cluster: {
          v1: {
            ClusterService: new (
              target: string,
              channelCredentials: ChannelCredentials
            ) => GrpcClusterServiceClient;
          };
        };
      };
    };
    const target = process.env.CLUSTER_SERVICE_GRPC_URL ?? 'cluster-service:50057';
    this.client = new loaded.photoops.cluster.v1.ClusterService(target, credentials.createInsecure());
  }

  generateClusters(input: GenerateClustersInput): Promise<GenerateClustersResult> {
    return new Promise((resolve, reject) => {
      this.client.GenerateClusters(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  getClusteringResult(input: GetClusteringResultInput): Promise<ClusteringResultRaw> {
    return new Promise((resolve, reject) => {
      this.client.GetClusteringResult(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  deleteClusteringResult(input: DeleteClusteringResultInput): Promise<Record<string, never>> {
    return new Promise((resolve, reject) => {
      this.client.DeleteClusteringResult(input, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  listClusteringResults(userId: string): Promise<{ results: ClusteringResultSummaryRaw[] }> {
    return new Promise((resolve, reject) => {
      this.client.ListClusteringResults({ userId }, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }

  listClusteringMethods(): Promise<{ methods: ClusteringMethodDescriptorRaw[] }> {
    return new Promise((resolve, reject) => {
      this.client.ListClusteringMethods({}, (error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }
}
