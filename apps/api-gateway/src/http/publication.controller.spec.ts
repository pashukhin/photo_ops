import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PostRaw, PublicationClient } from '../grpc/publication.client';
import { PublicationController } from './publication.controller';

function makePostRaw(overrides: Partial<PostRaw> = {}): PostRaw {
  return {
    id: 'post-1',
    userId: 'user-1',
    sourceClusterId: 'node-A',
    sourceResultId: 'result-1',
    title: '',
    body: '',
    status: 1, // draft
    visibility: 1, // private
    slug: '',
    locationLabel: '',
    dateFrom: '2024-06-15T10:00:00.000Z',
    dateTo: '2024-06-15T10:05:00.000Z',
    mapEnabled: false,
    publishedAt: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
    photos: [{ photoId: 'p1', order: 0, caption: '' }],
    ...overrides
  };
}

function createController() {
  const publicationClient = {
    createPostFromCluster: vi.fn(),
    getPost: vi.fn(),
    listPosts: vi.fn(),
    updatePost: vi.fn()
  } as unknown as PublicationClient;
  const authService = { requireSession: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
  return {
    controller: new PublicationController(publicationClient, authService as never),
    publicationClient,
    authService
  };
}

describe('PublicationController', () => {
  it('createPost: passes session userId + result/node, defaults title, maps enums to strings', async () => {
    // why: userId comes from the session (not the body); status/visibility enum
    // numbers become browser-facing strings.
    const { controller, publicationClient } = createController();
    vi.mocked(publicationClient.createPostFromCluster).mockResolvedValue(makePostRaw());

    const result = (await controller.createPost('photoops_session=s', {
      resultId: 'result-1',
      nodeId: 'node-A'
    })) as { status: string; visibility: string };

    expect(publicationClient.createPostFromCluster).toHaveBeenCalledWith({
      userId: 'user-1',
      resultId: 'result-1',
      nodeId: 'node-A',
      title: ''
    });
    expect(result.status).toBe('draft');
    expect(result.visibility).toBe('private');
  });

  it('createPost: rejects unauthenticated requests with 401', async () => {
    const { controller, authService } = createController();
    vi.mocked(authService.requireSession).mockRejectedValue(new UnauthorizedException('nope'));

    await expect(
      controller.createPost(undefined, { resultId: 'r1', nodeId: 'n1' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('getPost: fetches owner-scoped and maps enums to strings', async () => {
    const { controller, publicationClient } = createController();
    vi.mocked(publicationClient.getPost).mockResolvedValue(makePostRaw({ status: 2, visibility: 3 }));

    const result = (await controller.getPost('photoops_session=s', 'post-1')) as {
      status: string;
      visibility: string;
    };

    expect(publicationClient.getPost).toHaveBeenCalledWith({ userId: 'user-1', postId: 'post-1' });
    expect(result.status).toBe('published');
    expect(result.visibility).toBe('public');
  });

  it('listPosts: returns owner summaries with enums mapped to strings', async () => {
    const { controller, publicationClient } = createController();
    vi.mocked(publicationClient.listPosts).mockResolvedValue({
      posts: [
        {
          id: 'post-1',
          title: 'Trip',
          status: 1,
          visibility: 1,
          dateFrom: '',
          dateTo: '',
          photoCount: 2,
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z'
        }
      ]
    });

    const result = (await controller.listPosts('photoops_session=s')) as {
      posts: { status: string; visibility: string }[];
    };

    expect(publicationClient.listPosts).toHaveBeenCalledWith('user-1');
    expect(result.posts[0].status).toBe('draft');
    expect(result.posts[0].visibility).toBe('private');
  });

  it('updatePost: sends only present fields, mapping the visibility string to the proto enum', async () => {
    // why: PATCH semantics — omitted fields are not sent; visibility string ->
    // enum number for the gRPC call.
    const { controller, publicationClient } = createController();
    vi.mocked(publicationClient.updatePost).mockResolvedValue(makePostRaw({ title: 'New', visibility: 2 }));

    await controller.updatePost('photoops_session=s', 'post-1', { title: 'New', visibility: 'unlisted' });

    expect(publicationClient.updatePost).toHaveBeenCalledWith({
      userId: 'user-1',
      postId: 'post-1',
      title: 'New',
      visibility: 2
    });
  });
});
