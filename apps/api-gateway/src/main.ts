import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createCorsOptions } from './cors';
import { HttpErrorFilter } from './errors/http-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors(createCorsOptions());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(process.env.API_GATEWAY_PORT ?? 3001);
}

void bootstrap();
