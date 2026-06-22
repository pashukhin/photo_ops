import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { describe, expect, it, vi } from 'vitest';
import { PhotoGrpcController } from './photo.grpc.controller';

function createController() {
  const photoService = {
    createUploadIntent: vi.fn(),
    completeUpload: vi.fn(),
    listPhotos: vi.fn()
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
});
