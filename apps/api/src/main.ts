import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/environment';
import { configureApi } from './configure-app';
import { createOpenApiDocument, isOpenApiUiEnabled } from './openapi/openapi-document';
import { enableGracefulShutdown } from './observability/graceful-shutdown';
import { StructuredLogger } from './observability/structured-logger';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(__dirname, '../../.env'),
];
const envFile = envCandidates.find(existsSync);
if (envFile) config({ path: envFile });
validateEnvironment(process.env);
const logger = new StructuredLogger();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });
  configureApi(app, logger);
  if (isOpenApiUiEnabled(process.env)) {
    SwaggerModule.setup('docs', app, () => createOpenApiDocument(app));
  }
  enableGracefulShutdown(app, logger);
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap().catch((error: unknown) => {
  logger.event('fatal', 'application.startup.failed', {
    error,
  });
  process.exitCode = 1;
});
