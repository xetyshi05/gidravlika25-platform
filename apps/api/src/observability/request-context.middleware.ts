import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpMetricsService } from './http-metrics.service';
import { StructuredLogger, withRequestContext } from './structured-logger';

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export type RequestWithId = Request & { requestId?: string };

export function requestContextMiddleware(
  logger: StructuredLogger,
  metrics: HttpMetricsService,
): RequestHandler {
  return (request: RequestWithId, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const suppliedRequestId = request.get('x-request-id');
    const requestId =
      suppliedRequestId && requestIdPattern.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    withRequestContext(requestId, () => {
      response.once('finish', () => {
        const durationMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        metrics.recordResponse(response.statusCode, durationMilliseconds, request.path);
        logger.info('http.request.completed', {
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Number(durationMilliseconds.toFixed(1)),
        });
      });
      next();
    });
  };
}
