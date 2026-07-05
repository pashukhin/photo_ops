import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { makePinoHttpOptions } from '@photoops/observability';
import { HealthController } from './health/health.controller';
import { ClusterReader } from './post/cluster.reader';
import { PublicationGrpcController } from './post/post.grpc.controller';
import { PostRepository } from './post/post.repository';
import { PostDomainService } from './post/post.service';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: makePinoHttpOptions('publication-service') })],
  controllers: [HealthController, PublicationGrpcController],
  providers: [
    PostRepository,
    ClusterReader,
    {
      provide: PostDomainService,
      useFactory: (repository: PostRepository, clusters: ClusterReader) =>
        new PostDomainService(repository, clusters),
      inject: [PostRepository, ClusterReader]
    }
  ]
})
export class AppModule {}
