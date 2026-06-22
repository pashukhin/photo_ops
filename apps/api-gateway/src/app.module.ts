import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { IdentityClient } from './grpc/identity.client';
import { PhotoClient } from './grpc/photo.client';
import { AuthController } from './http/auth.controller';
import { HealthController } from './http/health.controller';
import { PhotoController } from './http/photo.controller';

@Module({
  controllers: [HealthController, AuthController, PhotoController],
  providers: [IdentityClient, AuthService, PhotoClient]
})
export class AppModule {}
