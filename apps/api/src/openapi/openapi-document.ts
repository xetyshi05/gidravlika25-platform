import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';
import { ApiError } from './api-error.response';

/**
 * OpenAPI description of the API (ARCH-01). The request and response classes
 * are described by the @nestjs/swagger CLI plugin (nest-cli.json), so the
 * document is complete only in code compiled by `nest build` / `nest start`.
 */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Гидравлика 25 API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, { extraModels: [ApiError] });
  // Every error, whatever the route, has the body of ApiExceptionFilter.
  for (const operations of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = operations[method];
      if (!operation) continue;
      operation.responses.default ??= {
        description: 'Ошибка',
        content: { 'application/json': { schema: { $ref: getSchemaPath(ApiError) } } },
      };
    }
  }
  return document;
}

/**
 * Swagger UI at /docs, only for local development: APP_ENV=development (or no
 * APP_ENV with NODE_ENV=development). Never with NODE_ENV production or test.
 */
export function isOpenApiUiEnabled(environment: NodeJS.ProcessEnv) {
  const appEnvironment = environment.APP_ENV?.trim();
  const nodeEnvironment = environment.NODE_ENV?.trim();
  if (nodeEnvironment === 'production' || nodeEnvironment === 'test') return false;
  return appEnvironment === 'development' || (!appEnvironment && nodeEnvironment === 'development');
}
