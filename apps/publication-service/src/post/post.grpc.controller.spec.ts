import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { describe, expect, it, vi } from 'vitest';
import { PublicationGrpcController } from './post.grpc.controller';
import { PostDomainService } from './post.service';
import { PostRecord } from './post.types';

function makePostRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 'post-1',
    userId: 'user-1',
    sourceClusterId: 'node-A',
    sourceResultId: 'result-1',
    title: 'Trip',
    body: 'body',
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
      { photoId: 'p2', order: 1, caption: 'hi' }
    ],
    ...overrides
  };
}

function createController(service: Partial<PostDomainService> = {}) {
  const postService = {
    createPostFromCluster: vi.fn(),
    getPost: vi.fn(),
    listPosts: vi.fn(),
    updatePost: vi.fn(),
    ...service
  };
  return {
    controller: new PublicationGrpcController(postService as unknown as PostDomainService),
    postService
  };
}

describe('PublicationGrpcController', () => {
  it('createPostFromCluster: defaults absent title to "" and maps the record to proto', async () => {
    // why: the proto boundary — status/visibility strings become enum numbers,
    // Date|null becomes ISO|"", slug null becomes "", photos carry order/caption.
    const { controller, postService } = createController({
      createPostFromCluster: vi.fn().mockResolvedValue(makePostRecord())
    });

    const res = await controller.createPostFromCluster({ userId: 'user-1', resultId: 'result-1', nodeId: 'node-A' });

    expect(postService.createPostFromCluster).toHaveBeenCalledWith({
      userId: 'user-1',
      resultId: 'result-1',
      nodeId: 'node-A',
      title: ''
    });
    expect(res.status).toBe(1); // draft
    expect(res.visibility).toBe(1); // private
    expect(res.slug).toBe('');
    expect(res.publishedAt).toBe('');
    expect(res.dateFrom).toBe('2024-06-15T10:00:00.000Z');
    expect(res.dateTo).toBe('2024-06-15T10:05:00.000Z');
    expect(res.photos).toEqual([
      { photoId: 'p1', order: 0, caption: '' },
      { photoId: 'p2', order: 1, caption: 'hi' }
    ]);
  });

  it('updatePost: builds a patch from only present fields, mapping the visibility enum', async () => {
    // why: PATCH semantics — omitted fields must not be sent to the domain, and
    // the visibility enum number maps back to the domain string.
    const { controller, postService } = createController({
      updatePost: vi.fn().mockResolvedValue(makePostRecord({ title: 'New', visibility: 'unlisted' }))
    });

    const res = await controller.updatePost({ postId: 'post-1', userId: 'user-1', title: 'New', visibility: 2 });

    expect(postService.updatePost).toHaveBeenCalledWith('user-1', 'post-1', { title: 'New', visibility: 'unlisted' });
    expect(res.visibility).toBe(2); // unlisted
  });

  it('health: reports ok', () => {
    const { controller } = createController();
    expect(controller.health()).toEqual({ status: 'ok', service: 'publication-service' });
  });

  it('listPosts: maps summaries to proto (enum numbers, ISO|"" dates)', async () => {
    // why: the list surface — status/visibility become enum numbers, a null date
    // becomes "".
    const { controller, postService } = createController({
      listPosts: vi.fn().mockResolvedValue([
        {
          id: 'post-1',
          title: 'Trip',
          status: 'draft',
          visibility: 'private',
          dateFrom: new Date('2024-06-15T10:00:00.000Z'),
          dateTo: null,
          photoCount: 2,
          createdAt: new Date('2026-07-05T00:00:00.000Z'),
          updatedAt: new Date('2026-07-05T00:00:00.000Z')
        }
      ])
    });

    const res = await controller.listPosts({ userId: 'user-1' });

    expect(postService.listPosts).toHaveBeenCalledWith('user-1');
    expect(res.posts[0]).toMatchObject({
      id: 'post-1',
      status: 1,
      visibility: 1,
      dateFrom: '2024-06-15T10:00:00.000Z',
      dateTo: '',
      photoCount: 2
    });
  });

  it('getPost: maps a "post not found" domain error to a NOT_FOUND rpc error', async () => {
    // why: the gateway turns gRPC NOT_FOUND into an HTTP 404 for owner scoping.
    const { controller } = createController({
      getPost: vi.fn().mockRejectedValue(new Error('post not found'))
    });

    await expect(controller.getPost({ postId: 'ghost', userId: 'user-1' })).rejects.toBeInstanceOf(RpcException);
    await controller.getPost({ postId: 'ghost', userId: 'user-1' }).catch((err: RpcException) => {
      expect((err.getError() as { code: number }).code).toBe(status.NOT_FOUND);
    });
  });

  it('createPostFromCluster: maps a "cluster ... not found" domain error to NOT_FOUND', async () => {
    // why: a bad/foreign result or node id is a client error (404), not a 500 —
    // this handler must map its domain errors like the others.
    const { controller } = createController({
      createPostFromCluster: vi.fn().mockRejectedValue(new Error('cluster node not found'))
    });

    await expect(
      controller.createPostFromCluster({ userId: 'user-1', resultId: 'r1', nodeId: 'ghost' })
    ).rejects.toBeInstanceOf(RpcException);
    await controller
      .createPostFromCluster({ userId: 'user-1', resultId: 'r1', nodeId: 'ghost' })
      .catch((err: RpcException) => {
        expect((err.getError() as { code: number }).code).toBe(status.NOT_FOUND);
      });
  });

  it('createPostFromCluster: maps "cluster result not ready" to INVALID_ARGUMENT', async () => {
    // why: a premature request against a not-yet-READY run is a 400, not a 500.
    const { controller } = createController({
      createPostFromCluster: vi.fn().mockRejectedValue(new Error('cluster result not ready'))
    });

    await controller
      .createPostFromCluster({ userId: 'user-1', resultId: 'r1', nodeId: 'n1' })
      .catch((err: RpcException) => {
        expect((err.getError() as { code: number }).code).toBe(status.INVALID_ARGUMENT);
      });
    await expect(
      controller.createPostFromCluster({ userId: 'user-1', resultId: 'r1', nodeId: 'n1' })
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('updatePost: maps a "post not found" domain error to a NOT_FOUND rpc error', async () => {
    // why: owner-scoped updates that miss must surface as a 404, like reads.
    const { controller } = createController({
      updatePost: vi.fn().mockRejectedValue(new Error('post not found'))
    });

    await expect(
      controller.updatePost({ postId: 'ghost', userId: 'user-1', title: 'x' })
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('updatePost: maps a present photos wrapper into PostPatch.photos', async () => {
    // why: proto3 optional message → the domain receives a flat {photoId,caption}[]
    // (order is list position); title stays a normal scalar field.
    const { controller, postService } = createController({
      updatePost: vi.fn().mockResolvedValue(makePostRecord())
    });

    await controller.updatePost({
      postId: 'post-1',
      userId: 'user-1',
      title: 'T',
      photos: {
        photos: [
          { photoId: 'p2', caption: 'hi' },
          { photoId: 'p1', caption: '' }
        ]
      }
    });

    expect(postService.updatePost).toHaveBeenCalledWith('user-1', 'post-1', {
      title: 'T',
      photos: [
        { photoId: 'p2', caption: 'hi' },
        { photoId: 'p1', caption: '' }
      ]
    });
  });

  it('updatePost: an empty photos wrapper decodes to [] (guarded 400), not a crash', async () => {
    // why: proto-loader drops an empty repeated, so a "remove all photos" PATCH
    // arrives as request.photos = {} (photos undefined). It must become [] so the
    // domain rejects it (invalid membership → 400), not throw a TypeError → 500.
    const updatePost = vi.fn().mockResolvedValue(makePostRecord());
    const { controller, postService } = createController({ updatePost });

    await controller.updatePost({ postId: 'p', userId: 'u', photos: {} });

    expect(postService.updatePost).toHaveBeenCalledWith('u', 'p', { photos: [] });
  });

  it('updatePost: with no photos wrapper does not set patch.photos', async () => {
    // why: a title-only PATCH must leave photos untouched (no empty replace).
    const { controller, postService } = createController({
      updatePost: vi.fn().mockResolvedValue(makePostRecord())
    });

    await controller.updatePost({ postId: 'post-1', userId: 'user-1', title: 'T' });

    expect(postService.updatePost).toHaveBeenCalledWith('user-1', 'post-1', { title: 'T' });
  });

  it.each(['invalid photo membership', 'node not selectable', 'empty node'])(
    'maps domain error "%s" to INVALID_ARGUMENT',
    async (message) => {
      // why: bad-input domain errors must surface as 400, not 500.
      const { controller } = createController({
        updatePost: vi.fn().mockRejectedValue(new Error(message))
      });

      await expect(
        controller.updatePost({
          postId: 'p',
          userId: 'u',
          photos: { photos: [{ photoId: 'p1', caption: '' }] }
        })
      ).rejects.toBeInstanceOf(RpcException);
      await controller
        .updatePost({ postId: 'p', userId: 'u', photos: { photos: [{ photoId: 'p1', caption: '' }] } })
        .catch((err: RpcException) => {
          expect((err.getError() as { code: number }).code).toBe(status.INVALID_ARGUMENT);
        });
    }
  );

  it('rethrows a non-not-found domain error unchanged (not wrapped as NOT_FOUND)', async () => {
    // why: only 'post not found' is a 404; other failures must propagate as-is.
    const boom = new Error('boom');
    const { controller } = createController({
      getPost: vi.fn().mockRejectedValue(boom)
    });

    await expect(controller.getPost({ postId: 'post-1', userId: 'user-1' })).rejects.toBe(boom);
  });
});
