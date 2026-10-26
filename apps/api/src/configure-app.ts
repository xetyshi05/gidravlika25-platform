import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ApiExceptionFilter } from './observability/api-exception.filter';
import { HttpMetricsService } from './observability/http-metrics.service';
import { requestContextMiddleware } from './observability/request-context.middleware';
import { StructuredLogger } from './observability/structured-logger';
import { apiSecurityHeaders } from './security';

export function configureApi(app: NestExpressApplication, logger = new StructuredLogger()) {
  app.useLogger(logger);

  const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10);
  if (Number.isSafeInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.use(requestContextMiddleware(logger, app.get(HttpMetricsService)));
  app.use(apiSecurityHeaders());
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: (
      process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:3001,http://localhost:3002'
    )
      .split(',')
      .map((origin) => origin.trim()),
    exposedHeaders: ['X-Request-Id'],
  });

  return app;
}
