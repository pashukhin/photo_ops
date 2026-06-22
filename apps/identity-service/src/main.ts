import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.identity.v1',
      protoPath: join(process.cwd(), '../../proto/identity/v1/identity_service.proto'),
      loader: { includeDirs: [join(process.cwd(), '../../proto')] },
      url: `0.0.0.0:${process.env.IDENTITY_SERVICE_GRPC_PORT ?? '50055'}`
    }
  });
  await app.startAllMicroservices();
  await app.listen(process.env.IDENTITY_SERVICE_HTTP_PORT ?? 3005);
}

void bootstrap();
