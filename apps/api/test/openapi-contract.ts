import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import type { NextFunction, Request, Response } from 'express';

/**
 * ARCH-01: checks real API answers against the committed OpenAPI contract.
 * The middleware records every JSON body the E2E suite receives; `problems()`
 * validates them. Objects are validated strictly (no undocumented fields), so
 * the contract can drift neither by a missing nor by an extra property.
 */
type Operation = { responses?: Record<string, { content?: Record<string, { schema?: object }> }> };
type Recorded = { method: string; path: string; status: number; body: unknown };

// Operational and test-only routes are deliberately outside the contract.
const uncontractedPaths = new Set(['/health', '/ready', '/metrics', '/ops/status']);

export class OpenApiContractRecorder {
  private readonly document = JSON.parse(
    readFileSync(join(__dirname, '../../../packages/api-contract/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>>; components: object };
  private readonly ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly recorded: Recorded[] = [];

  constructor() {
    this.ajv.addSchema(strict({ components: this.document.components }) as object, 'openapi');
  }

  readonly middleware = (request: Request, response: Response, next: NextFunction) => {
    const json = response.json.bind(response);
    response.json = (body: unknown) => {
      // Set once a route matched; unmatched URLs (404) have no operation to check.
      const route = (request.route as { path?: string } | undefined)?.path;
      if (route) {
        this.recorded.push({
          method: request.method.toLowerCase(),
          path: route.replace(/:(\w+)/g, '{$1}'),
          status: response.statusCode,
          // What the client receives: Date, Decimal and toJSON() already applied.
          body: body === undefined ? body : (JSON.parse(JSON.stringify(body)) as unknown),
        });
      }
      return json(body);
    };
    next();
  };

  get count() {
    return this.recorded.length;
  }

  problems() {
    const problems = new Set<string>();
    for (const { method, path, status, body } of this.recorded) {
      if (uncontractedPaths.has(path) || path.startsWith('/__e2e')) continue;
      const operation = this.document.paths[path]?.[method];
      if (!operation) {
        problems.add(`${method.toUpperCase()} ${path}: not in the contract`);
        continue;
      }
      const response = operation.responses?.[String(status)] ?? operation.responses?.default;
      const schema = response?.content?.['application/json']?.schema;
      if (!schema) {
        problems.add(`${method.toUpperCase()} ${path} ${status}: no JSON schema for this status`);
        continue;
      }
      const validate = this.validator(`${method} ${path} ${status}`, schema);
      if (!validate(body)) {
        for (const error of validate.errors ?? []) {
          const detail = error.params && 'additionalProperty' in error.params;
          problems.add(
            `${method.toUpperCase()} ${path} ${status}: ${error.instancePath || '/'} ${error.message}` +
              (detail ? ` (${String(error.params.additionalProperty)})` : ''),
          );
        }
      }
    }
    return [...problems];
  }

  private validator(key: string, schema: object) {
    let validate = this.validators.get(key);
    if (!validate) {
      validate = this.ajv.compile(strict(schema) as object);
      this.validators.set(key, validate);
    }
    return validate;
  }
}

/** Resolves refs against the shared document and forbids undocumented properties. */
function strict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!schema || typeof schema !== 'object') return schema;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    result[key] =
      key === '$ref' && typeof value === 'string'
        ? value.replace(/^#\//, 'openapi#/')
        : strict(value);
  }
  if (result.properties && result.additionalProperties === undefined) {
    result.additionalProperties = false;
  }
  // OpenAPI 3.0 `nullable` next to `allOf: [$ref]` (a nullable nested class):
  // Ajv would still apply the referenced object schema to null.
  if (result.nullable === true && Array.isArray(result.allOf)) {
    return { anyOf: [{ type: 'null' }, { allOf: result.allOf }] };
  }
  return result;
}
