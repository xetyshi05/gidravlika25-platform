const productionRequiredVariables = [
  'BOOTSTRAP_SECRET',
  'TOTP_ENCRYPTION_KEY',
  'WEB_ORIGIN',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_URL',
  'CATALOG_REVALIDATION_URL',
  'CATALOG_REVALIDATION_SECRET',
  'ALTCHA_HMAC_SECRET',
  'OPS_STATUS_TOKEN',
  'PERSONAL_DATA_DOCUMENT_VERSION',
  'PERSONAL_DATA_DOCUMENT_HASH',
  'PERSONAL_DATA_RETENTION_ENABLED',
  'PERSONAL_DATA_RETENTION_DAYS',
] as const;

export function validateEnvironment(environment: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const databaseUrl = required(environment, 'DATABASE_URL', errors);
  const appEnvironment = environment.APP_ENV?.trim();

  if (
    appEnvironment &&
    !['development', 'test', 'staging', 'production'].includes(appEnvironment)
  ) {
    errors.push('APP_ENV must be development, test, staging or production.');
  }

  if (databaseUrl) {
    validateUrl(databaseUrl, 'DATABASE_URL', errors, ['postgres:', 'postgresql:']);
  }

  validateOptionalInteger(environment, 'PORT', errors, 1, 65_535);
  validateOptionalInteger(environment, 'TRUST_PROXY_HOPS', errors, 0, 32);
  validateOptionalInteger(environment, 'PUBLIC_REQUEST_RATE_LIMIT_MAX', errors, 1, 100_000);
  validateOptionalInteger(
    environment,
    'PUBLIC_REQUEST_RATE_LIMIT_WINDOW_MS',
    errors,
    1_000,
    86_400_000,
  );
  validateOptionalInteger(environment, 'PUBLIC_REQUEST_CONTACT_LIMIT_MAX', errors, 1, 100_000);
  validateOptionalInteger(
    environment,
    'PUBLIC_REQUEST_CONTACT_LIMIT_WINDOW_MS',
    errors,
    1_000,
    604_800_000,
  );
  validateOptionalInteger(environment, 'PUBLIC_REQUEST_GLOBAL_LIMIT_MAX', errors, 1, 1_000_000);
  validateOptionalInteger(
    environment,
    'PUBLIC_REQUEST_GLOBAL_LIMIT_WINDOW_MS',
    errors,
    1_000,
    604_800_000,
  );
  validateOptionalInteger(environment, 'ALTCHA_COST', errors, 1, 1_000_000);
  validateOptionalInteger(environment, 'ALTCHA_MAX_COUNTER', errors, 2, 10_000_000);
  validateOptionalInteger(environment, 'ALTCHA_EXPIRES_SECONDS', errors, 60, 86_400);
  validateOptionalInteger(environment, 'REQUEST_FIRST_RESPONSE_MINUTES', errors, 1, 10_080);
  validateOptionalInteger(environment, 'DADATA_REQUEST_TIMEOUT_MS', errors, 100, 120_000);
  validateOptionalInteger(environment, 'S3_REQUEST_TIMEOUT_MS', errors, 100, 120_000);
  validateOptionalInteger(environment, 'CATALOG_REVALIDATION_TIMEOUT_MS', errors, 100, 120_000);
  validateOptionalInteger(environment, 'PERSONAL_DATA_RETENTION_DAYS', errors, 1, 36_500);
  validateOptionalInteger(environment, 'PERSONAL_DATA_RETENTION_INTERVAL_HOURS', errors, 1, 720);
  validateOptionalInteger(environment, 'PERSONAL_DATA_RETENTION_BATCH_SIZE', errors, 1, 10_000);
  validateOptionalEnum(environment, 'LOG_LEVEL', errors, [
    'debug',
    'info',
    'warn',
    'error',
    'fatal',
  ]);
  validateOptionalBoolean(environment, 'PERSONAL_DATA_RETENTION_ENABLED', errors);
  validateOptionalBoolean(environment, 'PERSONAL_DATA_RETENTION_DRY_RUN', errors);
  validateOptionalInteger(environment, 'DADATA_DAILY_LIMIT', errors, 1, 10_000_000);
  validateOptionalInteger(environment, 'SHUTDOWN_DRAIN_TIMEOUT_MS', errors, 1_000, 600_000);
  validateOptionalInteger(environment, 'OPS_ALERT_SERVER_ERRORS', errors, 1, 1_000_000);
  validateOptionalInteger(environment, 'OPS_ALERT_P95_MS', errors, 1, 600_000);
  validateOptionalInteger(environment, 'OPS_BACKUP_MAX_AGE_HOURS', errors, 1, 8_760);
  validateOptionalBoolean(environment, 'STORAGE_CLEANUP_ENABLED', errors);
  validateOptionalInteger(environment, 'STORAGE_CLEANUP_INTERVAL_MINUTES', errors, 1, 1_440);
  validateOptionalBoolean(environment, 'MEDIA_RECONCILE_ENABLED', errors);
  validateOptionalBoolean(environment, 'MEDIA_RECONCILE_DRY_RUN', errors);
  validateOptionalInteger(environment, 'MEDIA_RECONCILE_INTERVAL_HOURS', errors, 1, 720);
  validateOptionalInteger(environment, 'MEDIA_RECONCILE_GRACE_HOURS', errors, 1, 720);
  validateOptionalEnum(environment, 'TWO_FACTOR_MODE', errors, ['totp', 'mock']);
  validateOptionalSha256(environment.PERSONAL_DATA_DOCUMENT_HASH, errors);

  const twoFactorMode = environment.TWO_FACTOR_MODE?.trim().toLowerCase();
  if (twoFactorMode === 'mock') {
    const mockCode = environment.TWO_FACTOR_MOCK_CODE?.trim() ?? '000000';
    if (!/^\d{6}$/.test(mockCode)) {
      errors.push('TWO_FACTOR_MOCK_CODE must be a six-digit code.');
    }
    const isLocalEnvironment =
      appEnvironment === 'development' ||
      appEnvironment === 'test' ||
      environment.NODE_ENV === 'development' ||
      environment.NODE_ENV === 'test';
    if (!isLocalEnvironment) {
      errors.push('TWO_FACTOR_MODE=mock is allowed only in development or test environments.');
    }
  }

  validateOriginList(environment.WEB_ORIGIN, errors);
  validateOptionalUrl(environment.S3_ENDPOINT, 'S3_ENDPOINT', errors);
  validateOptionalUrl(environment.S3_PUBLIC_URL, 'S3_PUBLIC_URL', errors);
  validateOptionalUrl(environment.BACKGROUND_REMOVAL_URL, 'BACKGROUND_REMOVAL_URL', errors);
  validateOptionalUrl(environment.CATALOG_REVALIDATION_URL, 'CATALOG_REVALIDATION_URL', errors);

  if (
    environment.NODE_ENV === 'production' ||
    appEnvironment === 'production' ||
    appEnvironment === 'staging'
  ) {
    if (twoFactorMode === 'mock') {
      errors.push('TWO_FACTOR_MODE=mock must never be enabled in staging or production.');
    }
    for (const name of productionRequiredVariables) {
      required(environment, name, errors);
    }
    minimumLength(environment.BOOTSTRAP_SECRET, 'BOOTSTRAP_SECRET', 32, errors);
    minimumLength(environment.TOTP_ENCRYPTION_KEY, 'TOTP_ENCRYPTION_KEY', 32, errors);
    minimumLength(environment.ALTCHA_HMAC_SECRET, 'ALTCHA_HMAC_SECRET', 32, errors);
    minimumLength(environment.OPS_STATUS_TOKEN, 'OPS_STATUS_TOKEN', 32, errors);
    minimumLength(
      environment.CATALOG_REVALIDATION_SECRET,
      'CATALOG_REVALIDATION_SECRET',
      32,
      errors,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return environment;
}

function validateOptionalEnum(
  environment: NodeJS.ProcessEnv,
  name: string,
  errors: string[],
  values: string[],
) {
  const value = environment[name]?.trim().toLowerCase();
  if (value && !values.includes(value)) {
    errors.push(`${name} must be one of: ${values.join(', ')}.`);
  }
}

function required(environment: NodeJS.ProcessEnv, name: string, errors: string[]) {
  const value = environment[name]?.trim();
  if (!value) errors.push(`${name} is required.`);
  return value;
}

function validateOptionalInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  errors: string[],
  minimum: number,
  maximum: number,
) {
  const value = environment[name];
  if (value === undefined || value.trim() === '') return;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors.push(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function validateOptionalBoolean(environment: NodeJS.ProcessEnv, name: string, errors: string[]) {
  const value = environment[name]?.trim().toLowerCase();
  if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') {
    errors.push(`${name} must be true or false.`);
  }
}

function validateOriginList(value: string | undefined, errors: string[]) {
  if (!value) return;
  for (const origin of value.split(',').map((item) => item.trim())) {
    validateUrl(origin, 'WEB_ORIGIN', errors, ['http:', 'https:']);
  }
}

function validateOptionalUrl(value: string | undefined, name: string, errors: string[]) {
  if (value) validateUrl(value, name, errors, ['http:', 'https:']);
}

function validateUrl(value: string, name: string, errors: string[], protocols: string[]) {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(`${name} must use ${protocols.join(' or ')}.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

function minimumLength(value: string | undefined, name: string, length: number, errors: string[]) {
  if (value && value.length < length) {
    errors.push(`${name} must contain at least ${length} characters.`);
  }
}

function validateOptionalSha256(value: string | undefined, errors: string[]) {
  if (value && !/^[a-f\d]{64}$/i.test(value.trim())) {
    errors.push('PERSONAL_DATA_DOCUMENT_HASH must be a 64-character SHA-256 hex digest.');
  }
}
