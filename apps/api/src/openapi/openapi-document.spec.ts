import { isOpenApiUiEnabled } from './openapi-document';

describe('isOpenApiUiEnabled', () => {
  it('serves Swagger UI only in local development', () => {
    expect(isOpenApiUiEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isOpenApiUiEnabled({ NODE_ENV: 'development', APP_ENV: 'development' })).toBe(true);
    // apps/api/.env of a developer may set only APP_ENV.
    expect(isOpenApiUiEnabled({ APP_ENV: 'development' })).toBe(true);
    expect(isOpenApiUiEnabled({ NODE_ENV: 'production', APP_ENV: 'development' })).toBe(false);
    expect(isOpenApiUiEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isOpenApiUiEnabled({ NODE_ENV: 'test', APP_ENV: 'test' })).toBe(false);
    expect(isOpenApiUiEnabled({ NODE_ENV: 'development', APP_ENV: 'staging' })).toBe(false);
    expect(isOpenApiUiEnabled({ NODE_ENV: 'development', APP_ENV: 'production' })).toBe(false);
    expect(isOpenApiUiEnabled({})).toBe(false);
  });
});
