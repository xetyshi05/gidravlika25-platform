import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { RequestWithId } from './request-context.middleware';
import { StructuredLogger } from './structured-logger';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const statusCode: number =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= 500) {
      this.logger.event('error', 'http.request.failed', {
        requestId,
        method: request.method,
        path: request.path,
        statusCode,
        error: exception,
      });
    }

    if (response.headersSent) return;
    response.setHeader('X-Request-Id', requestId);
    // Client errors and explicit 503s carry messages written for the user
    // (for example "the background removal service is unavailable"); any other
    // server error may contain internal details and stays masked.
    const exposeMessage =
      exception instanceof HttpException &&
      (statusCode < 500 || statusCode === Number(HttpStatus.SERVICE_UNAVAILABLE));
    response.status(statusCode).json(
      exposeMessage
        ? this.httpExceptionBody(exception, statusCode, requestId)
        : {
            statusCode,
            message: 'Внутренняя ошибка сервера.',
            requestId,
          },
    );
  }

  private httpExceptionBody(exception: HttpException, statusCode: number, requestId: string) {
    const value = exception.getResponse();
    if (typeof value === 'string') {
      return { statusCode, message: value, requestId };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { statusCode, message: exception.message, requestId };
    }

    const source = value as Record<string, unknown>;
    return {
      statusCode,
      ...copyAllowed(source, ['message', 'error', 'status', 'code', 'checks']),
      requestId,
    };
  }
}

function copyAllowed(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}
