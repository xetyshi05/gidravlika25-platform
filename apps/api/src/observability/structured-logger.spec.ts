import { StructuredLogger, type LogLevel, withRequestContext } from './structured-logger';

describe('StructuredLogger', () => {
  it('writes structured JSON with the active request ID', () => {
    const entries: Array<{ line: string; level: LogLevel }> = [];
    const logger = new StructuredLogger((line, level) => entries.push({ line, level }));

    withRequestContext('request-test-123', () => {
      logger.info('http.request.completed', {
        method: 'GET',
        path: '/health',
        statusCode: 200,
        durationMs: 1.2,
      });
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('info');
    expect(JSON.parse(entries[0].line)).toMatchObject({
      level: 'info',
      event: 'http.request.completed',
      requestId: 'request-test-123',
      method: 'GET',
      path: '/health',
      statusCode: 200,
      durationMs: 1.2,
    });
  });

  it('redacts structured secrets and PII embedded in error text', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger((line) => lines.push(line));
    const error = new Error(
      'Failed for private@example.test, +7 (999) 123-45-67, Bearer secret-token-value',
    );

    logger.event('error', 'http.request.failed', {
      authorization: 'Bearer raw-token',
      cookie: 'crm_session=raw-cookie',
      payload: {
        email: 'private@example.test',
        phone: '+7 (999) 123-45-67',
      },
      error,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('private@example.test');
    expect(lines[0]).not.toContain('999) 123-45-67');
    expect(lines[0]).not.toContain('secret-token-value');
    expect(lines[0]).not.toContain('raw-cookie');
    expect(lines[0]).toContain('[REDACTED]');
    expect(lines[0]).toContain('[REDACTED_EMAIL]');
    expect(lines[0]).toContain('[REDACTED_PHONE]');
  });

  it('suppresses entries below the configured minimum level', () => {
    const levels: LogLevel[] = [];
    const logger = new StructuredLogger((_, level) => levels.push(level), 'warn');

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(levels).toEqual(['warn', 'error']);
  });
});
