import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { makePinoHttpOptions } from '@photoops/observability';
import { HealthController } from './health/health.controller';
import { LazyRabbitMqPublisher } from './messaging/rabbitmq-publisher';
import { ClusterReader } from './post/cluster.reader';
import { PublicationGrpcController } from './post/post.grpc.controller';
import { PostRepository } from './post/post.repository';
import { PostDomainService } from './post/post.service';
import { PostUsageEmitter } from './post/usage.emitter';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: makePinoHttpOptions('publication-service') })],
  controllers: [HealthController, PublicationGrpcController],
  providers: [
    PostRepository,
    ClusterReader,
    {
      provide: PostDomainService,
      useFactory: (repository: PostRepository, clusters: ClusterReader) => {
        // Lazy, non-throwing-at-boot publisher: usage.events is a best-effort
        // side channel, so the broker must NOT be a boot dependency (D6).
        const publisher = new LazyRabbitMqPublisher(
          process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672'
        );
        const usage = new PostUsageEmitter(publisher, process.env.USAGE_PROVIDER ?? 'local-demo');
        return new PostDomainService(repository, clusters, usage);
      },
      inject: [PostRepository, ClusterReader]
    }
  ]
})
export class AppModule {}
