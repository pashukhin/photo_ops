import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ClusterClient } from '../grpc/cluster.client';
import { ClusterController } from './cluster.controller';

function createController() {
  const clusterClient = {
    generateClusters: vi.fn(),
    getClusteringResult: vi.fn(),
    listClusteringResults: vi.fn(),
    listClusteringMethods: vi.fn()
  } as unknown as ClusterClient;
  const authService = { requireSession: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
  return {
    controller: new ClusterController(clusterClient, authService as never),
    clusterClient,
    authService
  };
}

describe('ClusterController', () => {
  it('generate: passes session userId + method/params, maps status enum to string', async () => {
    const { controller, clusterClient } = createController();
    vi.mocked(clusterClient.generateClusters).mockResolvedValue({ resultId: 'r1', status: 1 });

    const result = await controller.generate('photoops_session=s', {
      method: 'time_only',
      params: { linkage: 'average' }
    });

    expect(clusterClient.generateClusters).toHaveBeenCalledWith({
      userId: 'user-1',
      scope: 'all',
      method: 'time_only',
      paramsJson: JSON.stringify({ linkage: 'average' })
    });
    expect(result).toEqual({ resultId: 'r1', status: 'pending' });
  });

  it('generate: defaults scope to "all" and params to empty json', async () => {
    const { controller, clusterClient } = createController();
    vi.mocked(clusterClient.generateClusters).mockResolvedValue({ resultId: 'r1', status: 1 });

    await controller.generate('photoops_session=s', { method: 'time_only' });

    expect(clusterClient.generateClusters).toHaveBeenCalledWith({
      userId: 'user-1',
      scope: 'all',
      method: 'time_only',
      paramsJson: ''
    });
  });

  it('generate: rejects unauthenticated requests with 401', async () => {
    const { controller, authService } = createController();
    vi.mocked(authService.requireSession).mockRejectedValue(new UnauthorizedException('nope'));

    await expect(controller.generate(undefined, { method: 'time_only' })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('listMethods: authenticated pass-through', async () => {
    const { controller, clusterClient } = createController();
    const methods = { methods: [{ id: 'time_only', displayName: 'Time', description: '', requiredPhotoFields: ['taken_at'], defaultParamsJson: '{}' }] };
    vi.mocked(clusterClient.listClusteringMethods).mockResolvedValue(methods);

    expect(await controller.listMethods('photoops_session=s')).toEqual(methods);
  });

  it('listResults: maps summaries (status enum→string) for the session user', async () => {
    const { controller, clusterClient } = createController();
    vi.mocked(clusterClient.listClusteringResults).mockResolvedValue({
      results: [
        { id: 'r1', method: 'time_only', status: 2, photoCount: 3, dateFrom: 'a', dateTo: 'b', createdAt: 'c' }
      ]
    });

    const out = await controller.listResults('photoops_session=s');

    expect(clusterClient.listClusteringResults).toHaveBeenCalledWith('user-1');
    expect(out.results[0]).toEqual({
      id: 'r1',
      method: 'time_only',
      status: 'ready',
      photoCount: 3,
      dateFrom: 'a',
      dateTo: 'b',
      createdAt: 'c'
    });
  });

  it('getResult: owner-scoped; maps status + recursive node kind + flattens items', async () => {
    const { controller, clusterClient } = createController();
    vi.mocked(clusterClient.getClusteringResult).mockResolvedValue({
      id: 'r1',
      userId: 'user-1',
      method: 'time_only',
      paramsJson: '{}',
      inputFingerprint: 'fp',
      status: 2,
      errorMessage: '',
      createdAt: 'c',
      root: {
        id: 'root',
        kind: 1,
        mergeDistance: 0,
        dateFrom: 'a',
        dateTo: 'b',
        photoCount: 1,
        coverPhotoId: 'p1',
        segmentLabel: '',
        children: [
          {
            id: 'leaf',
            kind: 3,
            mergeDistance: 0,
            dateFrom: 'a',
            dateTo: 'a',
            photoCount: 1,
            coverPhotoId: 'p1',
            segmentLabel: '',
            children: [],
            items: [{ photoId: 'p1' }]
          }
        ],
        items: []
      }
    });

    const out = await controller.getResult('photoops_session=s', 'r1');

    expect(clusterClient.getClusteringResult).toHaveBeenCalledWith({ resultId: 'r1', userId: 'user-1' });
    expect(out.status).toBe('ready');
    expect(out.root?.kind).toBe('root');
    expect(out.root?.children[0].kind).toBe('leaf');
    expect(out.root?.children[0].items).toEqual(['p1']);
  });

  it('getResult: null root when not ready', async () => {
    const { controller, clusterClient } = createController();
    vi.mocked(clusterClient.getClusteringResult).mockResolvedValue({
      id: 'r1',
      userId: 'user-1',
      method: 'time_only',
      paramsJson: '{}',
      inputFingerprint: '',
      status: 1,
      errorMessage: '',
      createdAt: 'c'
    });

    const out = await controller.getResult('photoops_session=s', 'r1');
    expect(out.status).toBe('pending');
    expect(out.root).toBeNull();
  });
});
