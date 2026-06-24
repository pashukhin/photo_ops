import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { InMemoryBus } from './messaging/in-memory-bus';
import { MESSAGE_PUBLISHER, MessagePublisher } from './messaging/messaging.port';
import { PhotoGrpcController } from './photo/photo.grpc.controller';
import { PhotoRepository } from './photo/photo.repository';
import { PhotoDomainService } from './photo/photo.service';
import { MinioStorageService } from './storage/minio.service';

@Module({
  controllers: [HealthController, PhotoGrpcController],
  providers: [
    PhotoRepository,
    MinioStorageService,
    // Temporary in-memory publisher; Task 4.1 rebinds MESSAGE_PUBLISHER to the
    // RabbitMQ adapter.
    { provide: MESSAGE_PUBLISHER, useClass: InMemoryBus },
    {
      provide: PhotoDomainService,
      useFactory: (repository: PhotoRepository, storage: MinioStorageService, publisher: MessagePublisher) =>
        new PhotoDomainService(repository, storage, publisher),
      inject: [PhotoRepository, MinioStorageService, MESSAGE_PUBLISHER]
    }
  ]
})
export class AppModule {}
