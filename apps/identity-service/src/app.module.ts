import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { IdentityGrpcController } from './identity/identity.grpc.controller';
import { IdentityRepository } from './identity/identity.repository';
import { IdentityDomainService } from './identity/identity.service';
import { PasswordService } from './identity/password.service';

@Module({
  controllers: [HealthController, IdentityGrpcController],
  providers: [
    IdentityRepository,
    PasswordService,
    {
      provide: IdentityDomainService,
      useFactory: (repository: IdentityRepository, passwords: PasswordService) => new IdentityDomainService(repository, passwords),
      inject: [IdentityRepository, PasswordService]
    }
  ]
})
export class AppModule {}
