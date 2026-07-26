import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
  ClusterClient,
  ClusterNodeRaw,
  ClusteringResultRaw,
  ClusteringResultSummaryRaw
} from '../grpc/cluster.client';

// Proto enum (numeric, from proto-loader) → browser-facing string.
const STATUS: Record<number, string> = { 1: 'pending', 2: 'ready', 3: 'failed' };
const KIND: Record<number, string> = {
  1: 'root',
  2: 'internal',
  3: 'leaf',
  4: 'not_clusterable',
  5: 'segment'
};

export interface GenerateClustersBody {
  scope?: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ClusterNodeView {
  id: string;
  kind: string;
  mergeDistance: number;
  dateFrom: string;
  dateTo: string;
  photoCount: number;
  coverPhotoId: string;
  segmentLabel: string;
  children: ClusterNodeView[];
  items: string[];
}

function mapNode(node: ClusterNodeRaw): ClusterNodeView {
  return {
    id: node.id,
    kind: KIND[node.kind] ?? 'unspecified',
    mergeDistance: node.mergeDistance,
    dateFrom: node.dateFrom,
    dateTo: node.dateTo,
    photoCount: node.photoCount,
    coverPhotoId: node.coverPhotoId,
    segmentLabel: node.segmentLabel,
    children: (node.children ?? []).map(mapNode),
    items: (node.items ?? []).map((i) => i.photoId)
  };
}

function mapResult(raw: ClusteringResultRaw) {
  return {
    id: raw.id,
    userId: raw.userId,
    method: raw.method,
    paramsJson: raw.paramsJson,
    inputFingerprint: raw.inputFingerprint,
    status: STATUS[raw.status] ?? 'unspecified',
    errorMessage: raw.errorMessage,
    createdAt: raw.createdAt,
    root: raw.root ? mapNode(raw.root) : null
  };
}

function mapSummary(raw: ClusteringResultSummaryRaw) {
  return {
    id: raw.id,
    method: raw.method,
    status: STATUS[raw.status] ?? 'unspecified',
    photoCount: raw.photoCount,
    dateFrom: raw.dateFrom,
    dateTo: raw.dateTo,
    createdAt: raw.createdAt
  };
}

@Controller('v1')
export class ClusterController {
  constructor(
    private readonly clusterClient: ClusterClient,
    private readonly authService: AuthService
  ) {}

  @Post('clusters/generate')
  async generate(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() body: GenerateClustersBody
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    const result = await this.clusterClient.generateClusters({
      userId: auth.userId,
      scope: body.scope ?? 'all',
      method: body.method,
      paramsJson: body.params ? JSON.stringify(body.params) : ''
    });
    return { resultId: result.resultId, status: STATUS[result.status] ?? 'unspecified' };
  }

  @Get('clustering-methods')
  async listMethods(@Headers('cookie') cookieHeader: string | undefined) {
    await this.authService.requireSession(cookieHeader);
    return this.clusterClient.listClusteringMethods();
  }

  @Get('clustering-results')
  async listResults(@Headers('cookie') cookieHeader: string | undefined) {
    const auth = await this.authService.requireSession(cookieHeader);
    const { results } = await this.clusterClient.listClusteringResults(auth.userId);
    return { results: results.map(mapSummary) };
  }

  @Get('clustering-results/:resultId')
  async getResult(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('resultId') resultId: string
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    const raw = await this.clusterClient.getClusteringResult({ resultId, userId: auth.userId });
    return mapResult(raw);
  }

  // Soft-delete a run. Owner-scoped: a foreign / already-deleted id surfaces the
  // gRPC NOT_FOUND -> HTTP 404 via HttpErrorFilter (no IDOR).
  @Delete('clustering-results/:resultId')
  async deleteResult(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('resultId') resultId: string
  ) {
    const auth = await this.authService.requireSession(cookieHeader);
    await this.clusterClient.deleteClusteringResult({ resultId, userId: auth.userId });
    return { ok: true };
  }
}
