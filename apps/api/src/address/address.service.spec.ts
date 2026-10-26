import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpMetricsService } from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddressService } from './address.service';

/** Shared counter table, as every API replica sees it. */
function createCounters() {
  const rows = new Map<string, { requestCount: number; expiresAt: Date }>();
  const publicRequestRateLimit = {
    upsert: jest.fn(
      ({ where, create }: { where: { keyHash: string }; create: { expiresAt: Date } }) => {
        const row = rows.get(where.keyHash) ?? { requestCount: 0, expiresAt: create.expiresAt };
        row.requestCount += 1;
        rows.set(where.keyHash, row);
        return Promise.resolve({ requestCount: row.requestCount });
      },
    ),
    findUnique: jest.fn(({ where }: { where: { keyHash: string } }) =>
      Promise.resolve(rows.get(where.keyHash) ?? null),
    ),
  };
  return { rows, prisma: { publicRequestRateLimit } as unknown as PrismaService };
}

function okResponse() {
  return new Response(JSON.stringify({ suggestions: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AddressService external requests', () => {
  const originalFetch = global.fetch;
  let counters: ReturnType<typeof createCounters>;
  let metrics: HttpMetricsService;
  const service = () => new AddressService(counters.prisma, metrics);

  beforeEach(() => {
    process.env.DADATA_API_KEY = 'test-api-key';
    process.env.DADATA_REQUEST_TIMEOUT_MS = '2500';
    counters = createCounters();
    metrics = new HttpMetricsService();
    global.fetch = jest.fn(() => Promise.resolve(okResponse())) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    delete process.env.DADATA_API_KEY;
    delete process.env.DADATA_REQUEST_TIMEOUT_MS;
    delete process.env.DADATA_DAILY_LIMIT;
  });

  it('removes expired cache entries and keeps the cache bounded', async () => {
    const address = service();
    const internal = address as unknown as {
      cache: Map<string, { expiresAt: number; suggestions: never[] }>;
      removeExpiredEntries: (now: number) => void;
    };
    internal.cache.set('expired', { expiresAt: 999, suggestions: [] });
    internal.removeExpiredEntries(60_001);
    expect(internal.cache.size).toBe(0);

    for (let index = 0; index < 1_000; index += 1)
      internal.cache.set(`old-${index}`, { expiresAt: Date.now() + 60_000, suggestions: [] });
    await address.suggest('Новый адрес', 'new-client');

    expect(internal.cache.size).toBe(1_000);
    expect(internal.cache.has('old-0')).toBe(false);
  });

  it('shares the per-client limit between API replicas', async () => {
    // Two processes, one database: 30 requests a minute in total, not per process.
    const first = service();
    const second = service();
    for (let index = 0; index < 30; index += 1)
      await (index % 2 ? first : second).suggest(`Адрес ${index}`, 'client-1');

    await expect(first.suggest('Адрес 31', 'client-1')).rejects.toBeInstanceOf(HttpException);
    await expect(second.suggest('Адрес 32', 'client-2')).resolves.toEqual([]);
    expect(metrics.recentStats().daData.rate_limited).toBe(1);
  });

  it('stops calling DaData when the shared daily budget is spent and logs it once', async () => {
    process.env.DADATA_DAILY_LIMIT = '5';
    const events: string[] = [];
    const capture = (line: string | Uint8Array) => {
      const event = /"event":"(address\.[a-z_]+)"/.exec(String(line))?.[1];
      if (event) events.push(event);
      return true;
    };
    const writes = [
      jest.spyOn(process.stdout, 'write').mockImplementation(capture),
      jest.spyOn(process.stderr, 'write').mockImplementation(capture),
    ];
    try {
      for (let index = 0; index < 5; index += 1)
        await service().suggest(`Адрес ${index}`, `client-${index}`);
      await expect(service().suggest('Адрес 6', 'client-6')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service().suggest('Адрес 7', 'client-7')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      writes.forEach((write) => write.mockRestore());
    }

    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(events).toEqual(['address.dadata_budget_warning', 'address.dadata_budget_exhausted']);
    await expect(service().daDataBudget()).resolves.toMatchObject({ used: 7, limit: 5 });
    expect(metrics.recentStats().daData).toMatchObject({ success: 5, budget_exhausted: 2 });
  });

  it('starts a new budget at midnight in Moscow', async () => {
    process.env.DADATA_DAILY_LIMIT = '1';
    jest.useFakeTimers({ now: new Date('2026-09-24T20:59:00.000Z') });
    await service().suggest('Вечер', 'client-1');
    await expect(service().suggest('Ночь', 'client-2')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    jest.setSystemTime(new Date('2026-09-24T21:00:00.000Z'));
    await expect(service().suggest('Утро', 'client-3')).resolves.toEqual([]);
    await expect(service().daDataBudget()).resolves.toEqual({
      day: '2026-09-25',
      used: 1,
      limit: 1,
    });
    const [, budgetRow] = [...counters.rows.values()];
    expect(budgetRow?.expiresAt.toISOString()).toBe('2026-09-24T21:00:00.000Z');
  });

  it('attaches an abort signal to the DaData request', async () => {
    let requestInit: RequestInit | undefined;
    global.fetch = jest.fn((_input: string | URL | Request, init?: RequestInit) => {
      requestInit = init;
      return Promise.resolve(okResponse());
    });

    await service().suggest('Москва', 'client-1');

    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps request timeouts to HTTP 504', async () => {
    const timeout = new Error('request timed out');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeout) as typeof fetch;

    await expect(service().suggest('Москва', 'client-2')).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
    expect(metrics.recentStats().daData.timeout).toBe(1);
  });

  it('maps other network failures to HTTP 502', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable')) as typeof fetch;

    await expect(service().suggest('Москва', 'client-3')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(metrics.recentStats().daData.error).toBe(1);
  });
});
