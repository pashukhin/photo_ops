import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { makePinoHttpOptions } from '@photoops/observability';
import { AuthService } from './auth/auth.service';
import { ClusterClient } from './grpc/cluster.client';
import { IdentityClient } from './grpc/identity.client';
import { PhotoClient } from './grpc/photo.client';
import { PublicationClient } from './grpc/publication.client';
import { UsageClient } from './grpc/usage.client';
import { AuthController } from './http/auth.controller';
import { ClusterController } from './http/cluster.controller';
import { HealthController } from './http/health.controller';
import { PhotoController } from './http/photo.controller';
import { PublicationController } from './http/publication.controller';
import { UsageController } from './http/usage.controller';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: makePinoHttpOptions('api-gateway') })],
  controllers: [HealthController, AuthController, PhotoController, UsageController, ClusterController, PublicationController],
  providers: [IdentityClient, AuthService, PhotoClient, UsageClient, ClusterClient, PublicationClient]
})
export class AppModule {}
