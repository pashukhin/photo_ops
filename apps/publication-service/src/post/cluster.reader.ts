import { ChannelCredentials, credentials, loadPackageDefinition, status as grpcStatus } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { ClusterReaderPort } from './post.service';
import { ClusterResultTree, ClusterTreeNode } from './post.types';

// Raw gRPC shapes (proto-loader: camelCase keys, numeric enums, string dates).
interface ClusterItemRaw {
  photoId: string;
}

interface ClusterNodeRaw {
  id: string;
  kind: number;
  dateFrom: string;
  dateTo: string;
  children?: ClusterNodeRaw[];
  items?: ClusterItemRaw[];
}

interface ClusteringResultRaw {
  id: string;
  userId: string;
  status: number;
  root?: ClusterNodeRaw;
}

type Callback<T> = (error: (Error & { code?: number }) | null, value: T) => void;

interface GrpcClusterServiceClient {
  GetClusteringResult(input: { resultId: string; userId: string }, callback: Callback<ClusteringResultRaw>): void;
}

function mapNode(node: ClusterNodeRaw): ClusterTreeNode {
  return {
    id: node.id,
    kind: node.kind,
    dateFrom: node.dateFrom,
    dateTo: node.dateTo,
    children: (node.children ?? []).map(mapNode),
    items: (node.items ?? []).map((item) => ({ photoId: item.photoId }))
  };
}

// cluster-service read adapter. Excluded from unit coverage (IO adapter —
// exercised by the live smoke). Mirrors api-gateway's ClusterClient; a missing
// or not-owned result (gRPC NOT_FOUND) maps to null.
@Injectable()
export class ClusterReader implements ClusterReaderPort {
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

  async getResult(input: { resultId: string; userId: string }): Promise<ClusterResultTree | null> {
    try {
      const raw = await new Promise<ClusteringResultRaw>((resolve, reject) => {
        this.client.GetClusteringResult(input, (error, value) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(value);
        });
      });
      return {
        id: raw.id,
        userId: raw.userId,
        status: raw.status,
        root: raw.root ? mapNode(raw.root) : null
      };
    } catch (error) {
      if ((error as { code?: number }).code === grpcStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }
}
