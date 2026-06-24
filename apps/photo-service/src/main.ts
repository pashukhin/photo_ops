import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { ProcessingResultConsumer } from './photo/processing.consumer';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.photo.v1',
      protoPath: join(process.cwd(), '../../proto/photo/v1/photo_service.proto'),
      url: `0.0.0.0:${process.env.PHOTO_SERVICE_GRPC_PORT ?? '50051'}`,
      loader: {
        includeDirs: [join(process.cwd(), '../../proto')]
      }
    }
  });
  await app.startAllMicroservices();
  await app.listen(3002);

  // Start the RabbitMQ result consumer after the gRPC server is up.
  // The RabbitMqBus connection is already established by the async factory in
  // AppModule; consume() just registers a callback on the open channel.
  const resultConsumer = app.get(ProcessingResultConsumer);
  await resultConsumer.start();
}

void bootstrap();
