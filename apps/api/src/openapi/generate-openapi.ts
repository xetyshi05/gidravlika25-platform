import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { createOpenApiDocument } from './openapi-document';

// Writes the OpenAPI document without starting the API: preview mode scans
// modules and controllers but creates no providers (no database, no timers).
async function main() {
  const [output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node generate-openapi.js <output.json>');
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  const document = createOpenApiDocument(app);
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void main();
