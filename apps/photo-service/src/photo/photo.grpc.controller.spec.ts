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
    getPhoto: vi.fn()
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

  it('GetPhoto throws when domain service returns null', async () => {
    const { controller, photoService } = createController();
    photoService.getPhoto.mockResolvedValue(null);

    await expect(controller.getPhoto({ userId: 'user-1', photoId: 'missing' })).rejects.toThrow('photo not found');
  });
});
