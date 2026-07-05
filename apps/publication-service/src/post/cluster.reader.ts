import { Injectable } from '@nestjs/common';
import { ClusterReaderPort } from './post.service';
import { ClusterResultTree } from './post.types';

// cluster-service read adapter. Excluded from unit coverage (IO adapter —
// exercised by the live smoke). GREEN holds a proto-loaded ClusterService gRPC
// client (mirroring api-gateway's ClusterClient, CLUSTER_SERVICE_GRPC_URL) and
// maps a ClusteringResult into the lean ClusterResultTree, returning null when
// the result is missing or not owned by the caller.
@Injectable()
export class ClusterReader implements ClusterReaderPort {
  getResult(input: { resultId: string; userId: string }): Promise<ClusterResultTree | null> {
    return Promise.reject(new Error(`not implemented: getResult ${input.resultId}/${input.userId}`));
  }
}
