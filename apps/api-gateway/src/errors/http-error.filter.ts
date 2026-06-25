import { status as GrpcStatus } from '@grpc/grpc-js';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import pino from 'pino';
import { makeLoggerOptions } from '@photoops/observability';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger ?? pino(makeLoggerOptions('api-gateway'));
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === HttpStatus.UNAUTHORIZED ? 'unauthorized' : 'http_error';
      this.log(status, code, exception.message);
      response.status(status).json({ code, message: exception.message });
      return;
    }
    if (this.isGrpcError(exception)) {
      const mapped = this.mapGrpcError(exception);
      if (mapped) {
        this.log(mapped.status, mapped.code, exception.details || mapped.message);
        response.status(mapped.status).json({ code: mapped.code, message: exception.details || mapped.message });
        return;
      }
    }
    const message = exception instanceof Error ? exception.message : 'internal error';
    this.log(HttpStatus.INTERNAL_SERVER_ERROR, 'internal_error', message);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error', message });
  }

  private log(status: number, code: string, message: string) {
    const fields = { status, code, err_message: message };
    if (status >= 500) this.logger.error(fields, 'http.error');
    else this.logger.warn(fields, 'http.error');
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
