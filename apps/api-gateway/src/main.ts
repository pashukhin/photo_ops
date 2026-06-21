import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './errors/http-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(process.env.API_GATEWAY_PORT ?? 3001);
}

void bootstrap();
