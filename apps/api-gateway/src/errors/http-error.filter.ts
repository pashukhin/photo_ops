import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const message = exception instanceof Error ? exception.message : 'internal error';
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error', message });
  }
}
