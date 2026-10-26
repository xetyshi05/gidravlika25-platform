import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('requires a PostgreSQL database URL', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL is required');
    expect(() => validateEnvironment({ DATABASE_URL: 'mysql://localhost/database' })).toThrow(
      'DATABASE_URL must use postgres: or postgresql:',
    );
  });

  it('rejects invalid numeric settings', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/database',
        PUBLIC_REQUEST_RATE_LIMIT_MAX: '0',
        PORT: 'not-a-port',
      }),
    ).toThrow('PUBLIC_REQUEST_RATE_LIMIT_MAX');
  });

  it('requires operational secrets and S3 settings in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/database',
      }),
    ).toThrow('BOOTSTRAP_SECRET is required');
  });

  it('enables deployment validation through APP_ENV', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/database',
      }),
    ).toThrow('BOOTSTRAP_SECRET is required');
    expect(() =>
      validateEnvironment({
        APP_ENV: 'preview',
        DATABASE_URL: 'postgresql://localhost/database',
      }),
    ).toThrow('APP_ENV must be development, test, staging or production');
  });

  it('accepts a complete production environment', () => {
    const environment = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/database',
      BOOTSTRAP_SECRET: 'b'.repeat(32),
      TOTP_ENCRYPTION_KEY: 't'.repeat(32),
      WEB_ORIGIN: 'https://example.com,https://crm.example.com',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_REGION: 'ru-1',
      S3_BUCKET: 'catalog',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret-key',
      S3_PUBLIC_URL: 'https://cdn.example.com/catalog',
      CATALOG_REVALIDATION_URL: 'http://web:3000/api/revalidate-catalog',
      CATALOG_REVALIDATION_SECRET: 'r'.repeat(32),
      ALTCHA_HMAC_SECRET: 'h'.repeat(32),
      OPS_STATUS_TOKEN: 'o'.repeat(32),
      PERSONAL_DATA_DOCUMENT_VERSION: '2026-09-08',
      PERSONAL_DATA_DOCUMENT_HASH: 'a'.repeat(64),
      PERSONAL_DATA_RETENTION_ENABLED: 'true',
      PERSONAL_DATA_RETENTION_DAYS: '1095',
      PERSONAL_DATA_RETENTION_INTERVAL_HOURS: '24',
      PERSONAL_DATA_RETENTION_BATCH_SIZE: '100',
      PERSONAL_DATA_RETENTION_DRY_RUN: 'false',
      PORT: '4000',
    };

    expect(validateEnvironment(environment)).toBe(environment);
    expect(() => validateEnvironment({ ...environment, ALTCHA_HMAC_SECRET: 'short' })).toThrow(
      'ALTCHA_HMAC_SECRET must contain at least 32 characters',
    );
    expect(() => validateEnvironment({ ...environment, ALTCHA_COST: '0' })).toThrow('ALTCHA_COST');
    expect(() => validateEnvironment({ ...environment, OPS_STATUS_TOKEN: undefined })).toThrow(
      'OPS_STATUS_TOKEN',
    );
    expect(() => validateEnvironment({ ...environment, OPS_STATUS_TOKEN: 'short' })).toThrow(
      'OPS_STATUS_TOKEN must contain at least 32 characters',
    );
    expect(() => validateEnvironment({ ...environment, DADATA_DAILY_LIMIT: '0' })).toThrow(
      'DADATA_DAILY_LIMIT',
    );
  });

  it('rejects an invalid personal-data document hash', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/database',
        PERSONAL_DATA_DOCUMENT_HASH: 'not-a-sha256',
      }),
    ).toThrow('PERSONAL_DATA_DOCUMENT_HASH must be a 64-character SHA-256 hex digest');
  });

  it('rejects invalid retention settings', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/database',
        PERSONAL_DATA_RETENTION_ENABLED: 'yes',
        PERSONAL_DATA_RETENTION_DAYS: '0',
      }),
    ).toThrow('PERSONAL_DATA_RETENTION_DAYS');
  });

  it('rejects an unsupported log level', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/database',
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow('LOG_LEVEL must be one of: debug, info, warn, error, fatal');
  });

  it('allows the mock two-factor mode only for development and test environments', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/database',
        TWO_FACTOR_MODE: 'mock',
        TWO_FACTOR_MOCK_CODE: '123456',
      }),
    ).not.toThrow();

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/database',
        TWO_FACTOR_MODE: 'mock',
      }),
    ).toThrow('TWO_FACTOR_MODE=mock');
  });

  it('requires a six-digit mock two-factor code', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/database',
        TWO_FACTOR_MODE: 'mock',
        TWO_FACTOR_MOCK_CODE: 'test-code',
      }),
    ).toThrow('TWO_FACTOR_MOCK_CODE must be a six-digit code');
  });
});
