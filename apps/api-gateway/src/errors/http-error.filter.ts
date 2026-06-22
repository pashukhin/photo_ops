import { status as GrpcStatus } from '@grpc/grpc-js';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === HttpStatus.UNAUTHORIZED ? 'unauthorized' : 'http_error';
      response.status(status).json({ code, message: exception.message });
      return;
    }
    if (this.isGrpcError(exception) && exception.code === GrpcStatus.ALREADY_EXISTS) {
      response.status(HttpStatus.CONFLICT).json({ code: 'conflict', message: exception.details || 'already exists' });
      return;
    }
    const message = exception instanceof Error ? exception.message : 'internal error';
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error', message });
  }

  private isGrpcError(exception: unknown): exception is { code: number; details?: string } {
    return typeof exception === 'object' && exception !== null && 'code' in exception && typeof (exception as { code?: unknown }).code === 'number';
  }
}
