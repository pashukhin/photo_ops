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
    findBySlugPublic: vi.fn(),
    ...overrides.repository
  };
  const clusters: ClusterReaderPort = {
    getResult: vi.fn(),
    ...overrides.clusters
  };
  const usage = { emitPostPublished: vi.fn().mockResolvedValue(undefined) };
  return { service: new PostDomainService(repository, clusters, usage), repository, clusters, usage };
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

  it('rejects when the result has no tree yet (not READY)', async () => {
    // why: the cluster tree is absent until the run is READY — creating a post
    // from a PENDING/FAILED result must give a clear signal, not a misleading
    // 'node not found'.
    const { service } = createService({
      clusters: { getResult: vi.fn().mockResolvedValue({ id: 'result-1', userId: 'user-1', status: 1, root: null }) }
    });

    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'node-A', title: '' })
    ).rejects.toThrow('cluster result not ready');
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

describe('PostDomainService.updatePost replace-all photos', () => {
  it('applies a valid subset: reads current membership, then updates', async () => {
    // why: replace-all must validate against the post's snapshot before writing —
    // so it reads the current post first, then delegates the write.
    const current = makePostRecord(); // photos p1,p2,p3
    const updated = makePostRecord({ photos: [{ photoId: 'p2', order: 0, caption: 'hi' }] });
    const findByIdForUser = vi.fn().mockResolvedValue(current);
    const updateForUser = vi.fn().mockResolvedValue(updated);
    const { service } = createService({ repository: { findByIdForUser, updateForUser } });

    const result = await service.updatePost('user-1', 'post-1', {
      photos: [{ photoId: 'p2', caption: 'hi' }]
    });

    expect(findByIdForUser).toHaveBeenCalledWith('user-1', 'post-1');
    expect(updateForUser).toHaveBeenCalledWith('user-1', 'post-1', {
      photos: [{ photoId: 'p2', caption: 'hi' }]
    });
    expect(result).toBe(updated);
  });

  it('rejects an empty photos list', async () => {
    // why: a post with zero photos is meaningless (matches the create guard).
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()) }
    });
    await expect(service.updatePost('user-1', 'post-1', { photos: [] })).rejects.toThrow(
      'invalid photo membership'
    );
  });

  it('rejects a photo not in the post (no add via replace-all)', async () => {
    // why: replace-all removes/reorders/re-captions only — it cannot attach a
    // photo the post never snapshotted (which the caller may not even own).
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()) }
    });
    await expect(
      service.updatePost('user-1', 'post-1', {
        photos: [
          { photoId: 'p1', caption: '' },
          { photoId: 'p9', caption: '' }
        ]
      })
    ).rejects.toThrow('invalid photo membership');
  });

  it('rejects a duplicate photo id', async () => {
    // why: post_photos PK is (post_id, photo_id) — a dup would corrupt the write.
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()) }
    });
    await expect(
      service.updatePost('user-1', 'post-1', {
        photos: [
          { photoId: 'p1', caption: '' },
          { photoId: 'p1', caption: 'x' }
        ]
      })
    ).rejects.toThrow('invalid photo membership');
  });

  it('rejects when the post is absent or not owned', async () => {
    // why: the membership read is owner-scoped; a foreign/missing post → not found.
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      service.updatePost('user-1', 'ghost', { photos: [{ photoId: 'p1', caption: '' }] })
    ).rejects.toThrow('post not found');
  });

  it('title-only patch does not read membership and leaves photos untouched', async () => {
    // why: 4o2 #6 — a scalar-only PATCH must not touch post_photos, so it must
    // not even do the membership read.
    const findByIdForUser = vi.fn();
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ title: 'New' }));
    const { service } = createService({ repository: { findByIdForUser, updateForUser } });

    await service.updatePost('user-1', 'post-1', { title: 'New' });

    expect(findByIdForUser).not.toHaveBeenCalled();
    expect(updateForUser).toHaveBeenCalledWith('user-1', 'post-1', { title: 'New' });
  });
});

describe('PostDomainService.createPostFromCluster node-selection guard', () => {
  it('rejects the ROOT node (would snapshot the whole tree incl. not_clusterable)', async () => {
    // why: 4o2 #3 — posting root publishes the entire library, not an episode.
    const { service } = createService({
      clusters: { getResult: vi.fn().mockResolvedValue(makeTree()) } // root id='root', kind 1
    });
    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'root', title: '' })
    ).rejects.toThrow('node not selectable');
  });

  it('rejects a NOT_CLUSTERABLE node', async () => {
    // why: the excluded-photos bucket is not a story.
    const tree = makeTree();
    tree.root!.children.push({
      id: 'nc',
      kind: 4,
      dateFrom: '',
      dateTo: '',
      items: [{ photoId: 'x' }],
      children: []
    });
    const { service } = createService({ clusters: { getResult: vi.fn().mockResolvedValue(tree) } });
    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'nc', title: '' })
    ).rejects.toThrow('node not selectable');
  });

  it('rejects a selectable node whose subtree has no photos', async () => {
    // why: 4o2 #3 — an empty node yields a silently-empty 0-photo post.
    const tree = makeTree();
    tree.root!.children.push({
      id: 'empty',
      kind: 3,
      dateFrom: '',
      dateTo: '',
      items: [],
      children: []
    });
    const { service } = createService({ clusters: { getResult: vi.fn().mockResolvedValue(tree) } });
    await expect(
      service.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'empty', title: '' })
    ).rejects.toThrow('empty node');
  });
});

describe('PostDomainService.publishPost', () => {
  it('publishes a draft: sets status/visibility, mints an opaque slug + published_at, emits once', async () => {
    // why: first publish is the atomic "publish as <visibility>" transition — slug
    // and published_at are minted here (empty until now) and a usage event fires.
    const current = makePostRecord(); // draft, slug null, publishedAt null
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', visibility: 'public' }));
    const { service, usage } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(current), updateForUser }
    });

    await service.publishPost('user-1', 'post-1', 'public');

    const patch = vi.mocked(updateForUser).mock.calls[0][2];
    expect(patch.status).toBe('published');
    expect(patch.visibility).toBe('public');
    expect(patch.slug).toMatch(/^[A-Za-z0-9_-]{16,}$/); // opaque, unguessable token
    expect(patch.publishedAt).toBeInstanceOf(Date);
    expect(usage.emitPostPublished).toHaveBeenCalledWith({ postId: 'post-1', userId: 'user-1' });
  });

  it('republish keeps the existing slug and published_at (immutable)', async () => {
    // why: links + first-published-at stay stable across unpublish → republish.
    const at = new Date('2026-07-01T00:00:00.000Z');
    const current = makePostRecord({ status: 'unpublished', slug: 'frozenSlugToken00', publishedAt: at });
    const updateForUser = vi
      .fn()
      .mockResolvedValue(makePostRecord({ status: 'published', slug: 'frozenSlugToken00', publishedAt: at }));
    const { service } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(current), updateForUser }
    });

    await service.publishPost('user-1', 'post-1', 'unlisted');

    const patch = vi.mocked(updateForUser).mock.calls[0][2];
    expect(patch.slug).toBeUndefined(); // not regenerated
    expect(patch.publishedAt).toBeUndefined(); // not overwritten
    expect(patch.status).toBe('published');
    expect(patch.visibility).toBe('unlisted');
  });

  it('rejects publishing as private (guarded before any write)', async () => {
    // why: private cannot be a public/unlisted publication (defense in depth behind the gateway 400).
    const { service, repository } = createService();
    await expect(service.publishPost('user-1', 'post-1', 'private')).rejects.toThrow('cannot publish private');
    expect(repository.updateForUser).not.toHaveBeenCalled();
  });

  it('rejects when the post is absent or not owned', async () => {
    const { service } = createService({ repository: { findByIdForUser: vi.fn().mockResolvedValue(null) } });
    await expect(service.publishPost('user-1', 'ghost', 'public')).rejects.toThrow('post not found');
  });

  it('still resolves when the usage emit fails (fire-and-forget, best-effort)', async () => {
    // why: D6 — usage is a side channel; a broker/emit failure must NOT fail or
    // roll back publish. The emit is dispatched, its rejection swallowed.
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'published', visibility: 'public' }));
    const { service, usage } = createService({
      repository: { findByIdForUser: vi.fn().mockResolvedValue(makePostRecord()), updateForUser }
    });
    usage.emitPostPublished.mockRejectedValue(new Error('broker down'));

    await expect(service.publishPost('user-1', 'post-1', 'public')).resolves.toBeDefined();
    expect(usage.emitPostPublished).toHaveBeenCalled();
  });
});

describe('PostDomainService.unpublishPost', () => {
  it('flips status to unpublished, touching nothing else, emitting nothing', async () => {
    const updateForUser = vi.fn().mockResolvedValue(makePostRecord({ status: 'unpublished' }));
    const { service, usage } = createService({ repository: { updateForUser } });
    await service.unpublishPost('user-1', 'post-1');
    expect(updateForUser).toHaveBeenCalledWith('user-1', 'post-1', { status: 'unpublished' });
    expect(usage.emitPostPublished).not.toHaveBeenCalled();
  });

  it('rejects when the post is absent or not owned', async () => {
    const { service } = createService({ repository: { updateForUser: vi.fn().mockResolvedValue(null) } });
    await expect(service.unpublishPost('user-1', 'ghost')).rejects.toThrow('post not found');
  });
});

describe('PostDomainService.getPublicPostBySlug', () => {
  it('returns the post for a slug of a published public/unlisted post', async () => {
    const rec = makePostRecord({ status: 'published', visibility: 'public', slug: 'tok' });
    const findBySlugPublic = vi.fn().mockResolvedValue(rec);
    const { service } = createService({ repository: { findBySlugPublic } });
    const result = await service.getPublicPostBySlug('tok');
    expect(findBySlugPublic).toHaveBeenCalledWith('tok');
    expect(result).toBe(rec);
  });

  it('rejects (not found) when no published public/unlisted post has the slug', async () => {
    // why: draft/unpublished/private/unknown all collapse to not-found — no leak.
    const { service } = createService({ repository: { findBySlugPublic: vi.fn().mockResolvedValue(null) } });
    await expect(service.getPublicPostBySlug('tok')).rejects.toThrow('post not found');
  });
});
