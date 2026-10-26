import { LoggerService } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogWriter = (line: string, level: LogLevel) => void;

const logLevelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const requestContext = new AsyncLocalStorage<{ requestId: string }>();
const sensitiveKeyPattern =
  /authorization|cookie|password|secret|token|email|phone|idempotency|api.?key|access.?key/i;

export function withRequestContext<T>(requestId: string, callback: () => T) {
  return requestContext.run({ requestId }, callback);
}

export class StructuredLogger implements LoggerService {
  constructor(
    private readonly writer: LogWriter = defaultWriter,
    private readonly minimumLevel: LogLevel = resolveLogLevel(process.env.LOG_LEVEL),
  ) {}

  info(event: string, fields: Record<string, unknown> = {}) {
    this.emit('info', event, fields);
  }

  log(message: unknown, context?: string) {
    this.emit('info', 'application.log', { context, message });
  }

  warn(message: unknown, context?: string) {
    this.emit('warn', 'application.warning', { context, message });
  }

  error(message: unknown, trace?: string, context?: string) {
    this.emit('error', 'application.error', { context, message, trace });
  }

  debug(message: unknown, context?: string) {
    this.emit('debug', 'application.debug', { context, message });
  }

  verbose(message: unknown, context?: string) {
    this.emit('debug', 'application.verbose', { context, message });
  }

  fatal(message: unknown, context?: string) {
    this.emit('fatal', 'application.fatal', { context, message });
  }

  event(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
    this.emit(level, event, fields);
  }

  private emit(level: LogLevel, event: string, fields: Record<string, unknown>) {
    if (logLevelPriority[level] < logLevelPriority[this.minimumLevel]) return;

    const currentRequestId = requestContext.getStore()?.requestId;
    const sanitized = sanitize(fields) as Record<string, unknown>;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(currentRequestId ? { requestId: currentRequestId } : {}),
      ...sanitized,
    };
    this.writer(JSON.stringify(entry), level);
  }
}

export function resolveLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized in logLevelPriority ? (normalized as LogLevel) : 'info';
}

export function redactText(value: string) {
  return value
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[REDACTED]@')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:authorization|cookie|password|secret|token|idempotency-key|api-key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+7|8)[\s().-]*\d{3}[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g, '[REDACTED_PHONE]');
}

function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack ? redactText(value.stack) : undefined,
    };
  }
  if (depth >= 6) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitize(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    result[key] = sensitiveKeyPattern.test(key) ? '[REDACTED]' : sanitize(item, depth + 1, seen);
  }
  return result;
}

function defaultWriter(line: string, level: LogLevel) {
  const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}
