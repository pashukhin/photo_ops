import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { describe, expect, it, vi } from 'vitest';
import { PhotoGrpcController } from './photo.grpc.controller';

function makePhotoWithVariants() {
  return {
    photo: {
      id: 'photo-1',
      userId: 'user-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/photo-1/photo.jpg',
      status: 'ready' as const,
      width: 1920,
      height: 1080,
      takenAtLocal: '2024-01-15T10:30:00',
      takenAtUtc: new Date('2024-01-15T09:30:00.000Z'),
      takenAtTzSource: 'exif',
      cameraMake: 'Canon',
      cameraModel: 'EOS R5',
      orientation: 1,
      lat: 51.5074,
      lon: -0.1278,
      metadataJson: null,
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z')
    },
    variants: [
      {
        variantType: 'thumbnail' as const,
        url: 'signed://x',
        width: 200,
        height: 150
      }
    ]
  };
}

function createController() {
  const photoService = {
    createUploadIntent: vi.fn(),
    completeUpload: vi.fn(),
    listPhotos: vi.fn(),
    getPhoto: vi.fn(),
    listSpacetime: vi.fn(),
    getVariantsByIds: vi.fn()
  };
  return { controller: new PhotoGrpcController(photoService as never), photoService };
}

describe('PhotoGrpcController', () => {
  it('maps missing or non-owned uploads to not found', async () => {
    const { controller, photoService } = createController();
    photoService.completeUpload.mockRejectedValue(new Error('photo not found'));

    try {
      await controller.completeUpload({ userId: 'user-2', photoId: 'photo-1' });
      throw new Error('expected rpc exception');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toEqual({ code: status.NOT_FOUND, message: 'photo not found' });
    }
  });

  it('GetPhoto maps a photo with one variant → proto reply has status enum, attributes, and variant url', async () => {
    const { controller, photoService } = createController();
    const pwv = makePhotoWithVariants();
    photoService.getPhoto.mockResolvedValue(pwv);

    const reply = await controller.getPhoto({ userId: 'user-1', photoId: 'photo-1' });

    // Status enum: ready → 4
    expect(reply.status).toBe(4);
    // Attribute fields
    expect(reply.width).toBe(1920);
    expect(reply.height).toBe(1080);
    expect(reply.takenAtLocal).toBe('2024-01-15T10:30:00');
    expect(reply.takenAtUtc).toBe('2024-01-15T09:30:00.000Z');
    expect(reply.cameraMake).toBe('Canon');
    expect(reply.cameraModel).toBe('EOS R5');
    expect(reply.orientation).toBe(1);
    expect(reply.lat).toBe(51.5074);
    expect(reply.lon).toBe(-0.1278);
    // Variant with presigned url
    expect(reply.variants).toHaveLength(1);
    expect(reply.variants[0].url).toBe('signed://x');
    expect(reply.variants[0].variantType).toBe('thumbnail');
    expect(reply.variants[0].width).toBe(200);
    expect(reply.variants[0].height).toBe(150);
  });

  it('GetPhoto maps a missing photo to not found', async () => {
    const { controller, photoService } = createController();
    photoService.getPhoto.mockResolvedValue(null);

    try {
      await controller.getPhoto({ userId: 'user-1', photoId: 'missing' });
      throw new Error('expected rpc exception');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toEqual({ code: status.NOT_FOUND, message: 'photo not found' });
    }
  });

  describe('ListPhotos (session 011 query mapping)', () => {
    it('maps a full proto request (numeric enums) onto domain params and threads totalCount', async () => {
      // why: the controller is the proto<->domain boundary; proto-loader decodes
      // enums as numbers here, so the boundary must translate them to the clean
      // internal status/sort strings the service+repo consume, and pass the total
      // matching count straight through for "page N of M".
      const { controller, photoService } = createController();
      photoService.listPhotos.mockResolvedValue({ photos: [makePhotoWithVariants()], totalCount: 7 });

      const reply = (await controller.listPhotos({
        userId: 'user-1',
        page: 2,
        pageSize: 10,
        sortBy: 2, // PHOTO_SORT_FIELD_TAKEN_AT
        sortDir: 1, // SORT_DIRECTION_ASC
        statusFilter: [3, 4], // PROCESSING, READY
        filenameQuery: 'beach'
      })) as { photos: Array<{ status: number }>; totalCount: number };

      expect(photoService.listPhotos).toHaveBeenCalledWith({
        userId: 'user-1',
        page: 2,
        pageSize: 10,
        sortBy: 'taken_at',
        sortDir: 'asc',
        statusFilter: ['processing', 'ready'],
        filenameQuery: 'beach'
      });
      expect(reply.totalCount).toBe(7);
      expect(reply.photos).toHaveLength(1);
      expect(reply.photos[0].status).toBe(4); // ready -> proto enum 4
    });

    it('applies defaults for an empty request: page 1, size 24, created_at desc, no filters', async () => {
      // why: an unset proto field arrives as 0/absent; the boundary owns the
      // documented defaults so the service/repo never reason about "missing".
      const { controller, photoService } = createController();
      photoService.listPhotos.mockResolvedValue({ photos: [], totalCount: 0 });

      const reply = (await controller.listPhotos({ userId: 'user-1' })) as { photos: unknown[]; totalCount: number };

      expect(photoService.listPhotos).toHaveBeenCalledWith({
        userId: 'user-1',
        page: 1,
        pageSize: 24,
        sortBy: 'created_at',
        sortDir: 'desc',
        statusFilter: [],
        filenameQuery: ''
      });
      expect(reply.totalCount).toBe(0);
      expect(reply.photos).toEqual([]);
    });

    it('clamps an oversized pageSize to 100', async () => {
      // why: page size is attacker/caller controlled; the boundary caps the DB
      // LIMIT so a huge value cannot fetch the whole table.
      const { controller, photoService } = createController();
      photoService.listPhotos.mockResolvedValue({ photos: [], totalCount: 0 });

      await controller.listPhotos({ userId: 'user-1', pageSize: 5000 });

      expect(photoService.listPhotos).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
    });
  });

  describe('ListPhotoSpacetime (session 013 internal read-RPC)', () => {
    it('maps ready photos to the lean space-time + device shape', async () => {
      const { controller, photoService } = createController();
      photoService.listSpacetime.mockResolvedValue([
        makePhotoWithVariants().photo,
        { ...makePhotoWithVariants().photo, id: 'photo-2', takenAtUtc: null, lat: null, lon: null }
      ]);

      const reply = await controller.listPhotoSpacetime({ userId: 'user-1' });

      expect(photoService.listSpacetime).toHaveBeenCalledWith('user-1');
      expect(reply.photos[0]).toEqual({
        photoId: 'photo-1',
        takenAtUtc: '2024-01-15T09:30:00.000Z',
        takenAtLocal: '2024-01-15T10:30:00',
        cameraMake: 'Canon',
        cameraModel: 'EOS R5',
        lat: 51.5074,
        lon: -0.1278
      });
      // absent utc/coords collapse to empty string / omitted optional fields
      const second = reply.photos[1] as Record<string, unknown>;
      expect(second.takenAtUtc).toBe('');
      expect('lat' in second).toBe(false);
      expect('lon' in second).toBe(false);
    });
  });

  it('GetVariantsByIds delegates owner-scoped and wraps the results', async () => {
    // why: the batched variant surface — the domain result is wrapped into the
    // proto `{ results: [...] }` envelope; owner scope is the userId + photo ids.
    const { controller, photoService } = createController();
    photoService.getVariantsByIds.mockResolvedValue([
      { photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/k1', width: 40, height: 40 }] }
    ]);

    const res = await controller.getVariantsByIds({ userId: 'user-1', photoId: ['p1'] });

    expect(photoService.getVariantsByIds).toHaveBeenCalledWith('user-1', ['p1']);
    expect(res).toEqual({
      results: [{ photoId: 'p1', variants: [{ variantType: 'thumbnail', url: 'http://img/k1', width: 40, height: 40 }] }]
    });
  });
});
