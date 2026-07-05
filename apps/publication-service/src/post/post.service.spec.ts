import { describe, expect, it, vi } from 'vitest';
import { ClusterReaderPort, PostDomainService, PostRepositoryPort } from './post.service';
import { ClusterResultTree, CreatePostRow, PostRecord, PostSummaryRecord } from './post.types';

// A ready result whose node-A subtree is: items [p1], children [{p2},{p3}].
// Pre-order (items-then-children) photo order = p1, p2, p3.
function makeTree(): ClusterResultTree {
  return {
    id: 'result-1',
    userId: 'user-1',
    status: 2, // READY
    root: {
      id: 'root',
      kind: 1,
      dateFrom: '',
      dateTo: '',
      items: [],
      children: [
        {
          id: 'node-A',
          kind: 3,
          dateFrom: '2024-06-15T10:00:00.000Z',
          dateTo: '2024-06-15T10:05:00.000Z',
          items: [{ photoId: 'p1' }],
          children: [
            { id: 'leaf-1', kind: 3, dateFrom: '', dateTo: '', items: [{ photoId: 'p2' }], children: [] },
            { id: 'leaf-2', kind: 3, dateFrom: '', dateTo: '', items: [{ photoId: 'p3' }], children: [] }
          ]
        }
      ]
    }
  };
}

function makePostRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 'post-1',
    userId: 'user-1',
    sourceClusterId: 'node-A',
    sourceResultId: 'result-1',
    title: '',
    body: '',
    status: 'draft',
    visibility: 'private',
    slug: null,
    locationLabel: '',
    dateFrom: new Date('2024-06-15T10:00:00.000Z'),
    dateTo: new Date('2024-06-15T10:05:00.000Z'),
    mapEnabled: false,
    publishedAt: null,
    createdAt: new Date('2026-07-05T00:00:00.000Z'),
    updatedAt: new Date('2026-07-05T00:00:00.000Z'),
    photos: [
      { photoId: 'p1', order: 0, caption: '' },
      { photoId: 'p2', order: 1, caption: '' },
      { photoId: 'p3', order: 2, caption: '' }
    ],
    ...overrides
  };
}

function createService(overrides: {
  repository?: Partial<PostRepositoryPort>;
  clusters?: Partial<ClusterReaderPort>;
} = {}) {
  const repository: PostRepositoryPort = {
    createPostWithPhotos: vi.fn(),
    findByIdForUser: vi.fn(),
    listForUser: vi.fn(),
    updateForUser: vi.fn(),
    ...overrides.repository
  };
  const clusters: ClusterReaderPort = {
    getResult: vi.fn(),
    ...overrides.clusters
  };
  return { service: new PostDomainService(repository, clusters), repository, clusters };
}

describe('PostDomainService.createPostFromCluster', () => {
  it('snapshots the node subtree photos in tree order and seeds a private draft', async () => {
    // why: this is the whole feature — default-add all node photos (tree order),
    // seed dates from the node, status=draft/visibility=private, and (crucially)
    // location_label stays empty because the cluster carries no place (ADR-0005).
    const canned = makePostRecord();
    const { service, repository, clusters } = createService({
      repository: { createPostWithPhotos: vi.fn().mockResolvedValue(canned) },
      clusters: { getResult: vi.fn().mockResolvedValue(makeTree()) }
    });

    const result = await service.createPostFromCluster({
      userId: 'user-1',
      resultId: 'result-1',
      nodeId: 'node-A',
      title: ''
    });

    // owner-scoped read of the source result
    expect(clusters.getResult).toHaveBeenCalledWith({ resultId: 'result-1', userId: 'user-1' });

    const row = vi.mocked(repository.createPostWithPhotos).mock.calls[0][0] as CreatePostRow;
    expect(row.photos.map((p) => p.photoId)).toEqual(['p1', 'p2', 'p3']);
    expect(row.photos.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(row.photos.every((p) => p.caption === '')).toBe(true);
    expect(row.userId).toBe('user-1');
    expect(row.sourceClusterId).toBe('node-A');
    expect(row.sourceResultId).toBe('result-1');
    expect(row.status).toBe('draft');
    expect(row.visibility).toBe('private');
    expect(row.title).toBe('');
    expect(row.body).toBe('');
    expect(row.slug).toBeNull();
    expect(row.locationLabel).toBe('');
    expect(row.mapEnabled).toBe(false);
    expect(row.dateFrom).toEqual(new Date('2024-06-15T10:00:00.000Z'));
    expect(row.dateTo).toEqual(new Date('2024-06-15T10:05:00.000Z'));

    expect(result).toBe(canned);
  });

  it('rejects when the clustering result is not found / not owned', async () => {
    // why: owner scoping — a missing (or other-user) result must not create a post.
    const { service } = createService({
      clusters: { getResult: vi.fn().mockResolvedValue(null) }
    });

    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'nope', nodeId: 'node-A', title: '' })
    ).rejects.toThrow('cluster result not found');
  });

  it('rejects when the node is absent from the result tree', async () => {
    // why: a post's source must be a real node of the result.
    const { service } = createService({
      clusters: { getResult: vi.fn().mockResolvedValue(makeTree()) }
    });

    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'ghost', title: '' })
    ).rejects.toThrow('cluster node not found');
  });
});

describe('PostDomainService owner-scoped reads/updates', () => {
  it('getPost returns the owner\'s post', async () => {
    const canned = makePostRecord();
    const { service, repository } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(canned) }
    });

    const result = await service.getPost('user-1', 'post-1');

    expect(repository.findByIdForUser).toHaveBeenCalledWith('user-1', 'post-1');
    expect(result).toBe(canned);
  });

  it('getPost rejects when the post is absent or not owned', async () => {
    // why: cross-user reads must not leak — repo returns null → not found.
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(null) }
    });

    await expect(service.getPost('user-1', 'other-post')).rejects.toThrow('post not found');
  });

  it('listPosts returns the owner\'s summaries', async () => {
    const summaries: PostSummaryRecord[] = [
      {
        id: 'post-1',
        title: 'Trip',
        status: 'draft',
        visibility: 'private',
        dateFrom: null,
        dateTo: null,
        photoCount: 3,
        createdAt: new Date('2026-07-05T00:00:00.000Z'),
        updatedAt: new Date('2026-07-05T00:00:00.000Z')
      }
    ];
    const { service, repository } = createService({
      repository: { listForUser: vi.fn().mockResolvedValue(summaries) }
    });

    const result = await service.listPosts('user-1');

    expect(repository.listForUser).toHaveBeenCalledWith('user-1');
    expect(result).toBe(summaries);
  });

  it('updatePost applies the patch owner-scoped and returns the updated post', async () => {
    const canned = makePostRecord({ title: 'New title' });
    const { service, repository } = createService({
      repository: { updateForUser: vi.fn().mockResolvedValue(canned) }
    });

    const result = await service.updatePost('user-1', 'post-1', { title: 'New title' });

    expect(repository.updateForUser).toHaveBeenCalledWith('user-1', 'post-1', { title: 'New title' });
    expect(result).toBe(canned);
  });

  it('updatePost rejects when the post is absent or not owned', async () => {
    // why: cross-user updates must not mutate — repo returns null → not found.
    const { service } = createService({
      repository: { updateForUser: vi.fn().mockResolvedValue(null) }
    });

    await expect(service.updatePost('user-1', 'other-post', { title: 'x' })).rejects.toThrow('post not found');
  });
});
