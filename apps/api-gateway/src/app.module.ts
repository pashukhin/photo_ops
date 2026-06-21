import { Module } from '@nestjs/common';
import { PhotoClient } from './grpc/photo.client';
import { HealthController } from './http/health.controller';
import { PhotoController } from './http/photo.controller';

@Module({
  controllers: [HealthController, PhotoController],
  providers: [PhotoClient]
})
export class AppModule {}
