import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PhotoGrpcController } from './photo/photo.grpc.controller';
import { PhotoRepository } from './photo/photo.repository';
import { PhotoDomainService } from './photo/photo.service';
import { MinioStorageService } from './storage/minio.service';

@Module({
  controllers: [HealthController, PhotoGrpcController],
  providers: [
    PhotoRepository,
    MinioStorageService,
    {
      provide: PhotoDomainService,
      useFactory: (repository: PhotoRepository, storage: MinioStorageService) => new PhotoDomainService(repository, storage),
      inject: [PhotoRepository, MinioStorageService]
    }
  ]
})
export class AppModule {}
