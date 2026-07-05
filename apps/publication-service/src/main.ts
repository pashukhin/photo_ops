import './tracing';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { GrpcLoggingInterceptor } from '@photoops/observability';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new GrpcLoggingInterceptor('publication-service'));
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.publication.v1',
      protoPath: join(process.cwd(), '../../proto/publication/v1/publication_service.proto'),
      url: `0.0.0.0:${process.env.PUBLICATION_SERVICE_GRPC_PORT ?? '50058'}`,
      loader: {
        includeDirs: [join(process.cwd(), '../../proto')]
      }
    }
  });
  await app.startAllMicroservices();
  await app.listen(3012);
}

void bootstrap();
