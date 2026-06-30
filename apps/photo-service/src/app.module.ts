import { Module } from '@nestjs/common';
import { LoggerModule, PinoLogger } from 'nestjs-pino';
import { makePinoHttpOptions } from '@photoops/observability';
import { HealthController } from './health/health.controller';
import { RabbitMqBus } from './messaging/rabbitmq-bus';
import { MESSAGE_PUBLISHER, MessagePublisher } from './messaging/messaging.port';
import { PhotoGrpcController } from './photo/photo.grpc.controller';
import { PhotoRepository } from './photo/photo.repository';
import { PhotoDomainService } from './photo/photo.service';
import { ProcessingResultConsumer } from './photo/processing.consumer';
import { UsageEmitter } from './photo/usage.emitter';
import { MinioStorageService } from './storage/minio.service';

// DI token for the single shared RabbitMqBus instance (used as both publisher
// and consumer source so only one AMQP connection is opened).
const RABBITMQ_BUS = 'RABBITMQ_BUS';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: makePinoHttpOptions('photo-service') })],
  controllers: [HealthController, PhotoGrpcController],
  providers: [
    PhotoRepository,
    MinioStorageService,
    // ONE shared RabbitMqBus instance serves as both publisher and consumer.
    {
      provide: RABBITMQ_BUS,
      useFactory: async (): Promise<RabbitMqBus> =>
        RabbitMqBus.create(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672')
    },
    // MESSAGE_PUBLISHER re-exported from the shared bus instance.
    {
      provide: MESSAGE_PUBLISHER,
      useExisting: RABBITMQ_BUS
    },
    {
      provide: UsageEmitter,
      useFactory: (publisher: MessagePublisher) =>
        new UsageEmitter(publisher, process.env.USAGE_PROVIDER ?? 'local-demo'),
      inject: [MESSAGE_PUBLISHER]
    },
    {
      provide: PhotoDomainService,
      useFactory: (repository: PhotoRepository, storage: MinioStorageService, publisher: MessagePublisher, logger: PinoLogger, usageEmitter: UsageEmitter) =>
        new PhotoDomainService(repository, storage, publisher, logger, usageEmitter),
      inject: [PhotoRepository, MinioStorageService, MESSAGE_PUBLISHER, PinoLogger, UsageEmitter]
    },
    // ProcessingResultConsumer wired with the same bus instance as its consumer
    // source and the domain service as the finalize handler.
    {
      provide: ProcessingResultConsumer,
      useFactory: (bus: RabbitMqBus, service: PhotoDomainService) =>
        new ProcessingResultConsumer(bus, service),
      inject: [RABBITMQ_BUS, PhotoDomainService]
    }
  ]
})
export class AppModule {}
