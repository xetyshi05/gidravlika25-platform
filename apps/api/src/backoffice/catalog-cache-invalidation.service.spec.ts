import { CatalogCacheInvalidationService } from './catalog-cache-invalidation.service';

describe('CatalogCacheInvalidationService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.CATALOG_REVALIDATION_URL = 'http://web:3000/api/revalidate-catalog';
    process.env.CATALOG_REVALIDATION_SECRET = 'shared-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.CATALOG_REVALIDATION_URL;
    delete process.env.CATALOG_REVALIDATION_SECRET;
  });

  it('calls the protected Web revalidation endpoint', async () => {
    let requestInit: RequestInit | undefined;
    global.fetch = jest.fn((_input: string | URL | Request, init?: RequestInit) => {
      requestInit = init;
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await expect(new CatalogCacheInvalidationService().invalidate()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://web:3000/api/revalidate-catalog',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer shared-secret' },
      }),
    );
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not fail a completed catalog mutation when revalidation is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as typeof fetch;

    await expect(new CatalogCacheInvalidationService().invalidate()).resolves.toBe(false);
  });
});
