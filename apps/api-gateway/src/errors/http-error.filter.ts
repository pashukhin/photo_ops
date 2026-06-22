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
    if (this.isGrpcError(exception)) {
      const mapped = this.mapGrpcError(exception);
      if (mapped) {
        response.status(mapped.status).json({ code: mapped.code, message: exception.details || mapped.message });
        return;
      }
    }
    const message = exception instanceof Error ? exception.message : 'internal error';
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error', message });
  }

  private isGrpcError(exception: unknown): exception is { code: number; details?: string } {
    return typeof exception === 'object' && exception !== null && 'code' in exception && typeof (exception as { code?: unknown }).code === 'number';
  }

  private mapGrpcError(exception: { code: number }) {
    switch (exception.code) {
      case GrpcStatus.ALREADY_EXISTS:
        return { status: HttpStatus.CONFLICT, code: 'conflict', message: 'already exists' };
      case GrpcStatus.UNAUTHENTICATED:
        return { status: HttpStatus.UNAUTHORIZED, code: 'unauthorized', message: 'authentication required' };
      case GrpcStatus.NOT_FOUND:
        return { status: HttpStatus.NOT_FOUND, code: 'not_found', message: 'not found' };
      case GrpcStatus.INVALID_ARGUMENT:
        return { status: HttpStatus.BAD_REQUEST, code: 'bad_request', message: 'bad request' };
      default:
        return undefined;
    }
  }
}
