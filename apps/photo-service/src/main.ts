import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.photo.v1',
      protoPath: join(process.cwd(), '../../proto/photo/v1/photo_service.proto'),
      url: `0.0.0.0:${process.env.PHOTO_SERVICE_GRPC_PORT ?? '50051'}`
    }
  });
  await app.startAllMicroservices();
  await app.listen(3002);
}

void bootstrap();
