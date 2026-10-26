import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpMetricsService, type DaDataOutcome } from '../observability/http-metrics.service';
import { StructuredLogger } from '../observability/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { incrementRateLimitCounter, readRateLimitCounter } from '../prisma/rate-limit-counter';

type DaDataAddressSuggestion = {
  value: string;
  unrestricted_value: string;
  data: {
    postal_code: string | null;
    region_with_type: string | null;
    area_with_type: string | null;
    city_with_type: string | null;
    settlement_with_type: string | null;
    street_with_type: string | null;
    house: string | null;
    block: string | null;
    flat: string | null;
  };
};

type DaDataAddressResponse = {
  suggestions: DaDataAddressSuggestion[];
};

import type { AddressSuggestion, DeliveryAddressDetails } from './address.response';

export type { AddressSuggestion, DeliveryAddressDetails };

type CachedSuggestions = {
  expiresAt: number;
  suggestions: AddressSuggestion[];
};

export type DaDataBudget = { day: string; used: number; limit: number };

const CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const DEFAULT_DADATA_REQUEST_TIMEOUT_MS = 5_000;
/** DaData's free plan allows 10 000 suggestions a day; keep a margin. */
const DEFAULT_DADATA_DAILY_LIMIT = 9_000;
/** Share of the daily budget after which a warning is logged once. */
export const DADATA_BUDGET_WARNING_SHARE = 0.8;
/** DaData counts the day in Moscow time (UTC+3, no daylight saving). */
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 1_000;
const budgetExhaustedMessage = 'Подсказки адресов временно недоступны. Адрес можно ввести вручную.';

/**
 * Rate limits and the daily DaData budget live in the database (INT-01), so
 * all API replicas share them. The cache stays per process: it only saves
 * calls, and a miss in one replica is still counted against the shared budget.
 */
@Injectable()
export class AddressService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<string, CachedSuggestions>();
  private readonly logger = new StructuredLogger();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HttpMetricsService,
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      this.removeExpiredEntries(Date.now());
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async suggest(query: string, clientIdentifier: string): Promise<AddressSuggestion[]> {
    const normalizedQuery = query.toLocaleLowerCase('ru-RU');
    const now = Date.now();
    const cachedResult = this.cache.get(normalizedQuery);

    if (cachedResult && cachedResult.expiresAt > now) {
      return cachedResult.suggestions;
    }
    if (cachedResult) this.cache.delete(normalizedQuery);

    await this.checkRateLimit(clientIdentifier, now);

    const apiKey = process.env.DADATA_API_KEY;

    if (!apiKey) {
      throw new ServiceUnavailableException('Сервис адресных подсказок не настроен.');
    }

    await this.reserveDaDataRequest(now);

    let response: Response;

    try {
      response = await fetch(
        'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            count: 5,
            locations: [{ country: 'Россия' }],
          }),
          signal: AbortSignal.timeout(this.requestTimeout()),
        },
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        this.metrics.recordDaDataRequest('timeout');
        throw new GatewayTimeoutException('Сервис адресных подсказок не ответил вовремя.');
      }
      this.metrics.recordDaDataRequest('error');
      throw new BadGatewayException('Не удалось обратиться к сервису адресных подсказок.');
    }

    if (!response.ok) {
      this.metrics.recordDaDataRequest('error');
      this.logger.event('warn', 'address.dadata_request_failed', { status: response.status });
      throw new BadGatewayException('Сервис адресных подсказок временно недоступен.');
    }
    this.metrics.recordDaDataRequest('success');

    const data = (await response.json()) as DaDataAddressResponse;

    const suggestions = data.suggestions.map((suggestion) => ({
      value: suggestion.value,
      unrestrictedValue: suggestion.unrestricted_value,
      details: {
        postalCode: suggestion.data.postal_code,
        region: suggestion.data.region_with_type,
        area: suggestion.data.area_with_type,
        city: suggestion.data.city_with_type,
        settlement: suggestion.data.settlement_with_type,
        street: suggestion.data.street_with_type,
        house: suggestion.data.house,
        block: suggestion.data.block,
        flat: suggestion.data.flat,
      },
    }));

    this.setBounded(
      this.cache,
      normalizedQuery,
      {
        expiresAt: now + CACHE_TTL_MS,
        suggestions,
      },
      MAX_CACHE_ENTRIES,
    );

    return suggestions;
  }

  /** Today's DaData calls against the daily limit, for the operations status. */
  async daDataBudget(now = Date.now()): Promise<DaDataBudget> {
    const day = moscowDay(now);
    return {
      day,
      used: await readRateLimitCounter(this.prisma, daDataBudgetKey(day)),
      limit: daDataDailyLimit(),
    };
  }

  private async checkRateLimit(clientIdentifier: string, now: number) {
    const windowStart = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
    const requests = await incrementRateLimitCounter(
      this.prisma,
      `address-client:${clientIdentifier}:${windowStart}`,
      windowStart + RATE_LIMIT_WINDOW_MS,
    );
    if (requests > MAX_REQUESTS_PER_WINDOW) {
      this.record('rate_limited');
      throw new HttpException(
        'Слишком много запросов адресных подсказок. Повторите попытку позже.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Counts the call before it is sent, so parallel requests cannot overrun the
   * budget together. The warning and the exhaustion are logged once a day.
   */
  private async reserveDaDataRequest(now: number) {
    const day = moscowDay(now);
    const limit = daDataDailyLimit();
    const used = await incrementRateLimitCounter(
      this.prisma,
      daDataBudgetKey(day),
      moscowDayEnd(now),
    );
    const warningAt = Math.ceil(limit * DADATA_BUDGET_WARNING_SHARE);
    if (used === warningAt && used <= limit)
      this.logger.event('warn', 'address.dadata_budget_warning', { day, used, limit });
    if (used <= limit) return;
    if (used === limit + 1)
      this.logger.event('error', 'address.dadata_budget_exhausted', { day, limit });
    this.record('budget_exhausted');
    throw new ServiceUnavailableException(budgetExhaustedMessage);
  }

  private record(outcome: DaDataOutcome) {
    this.metrics.recordDaDataRequest(outcome);
  }

  private removeExpiredEntries(now: number) {
    for (const [key, value] of this.cache) {
      if (value.expiresAt <= now) this.cache.delete(key);
    }
  }

  private setBounded<Key, Value>(
    map: Map<Key, Value>,
    key: Key,
    value: Value,
    maximumSize: number,
  ) {
    if (!map.has(key) && map.size >= maximumSize) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) map.delete(oldestKey);
    }
    map.set(key, value);
  }

  private requestTimeout() {
    const configured = Number(process.env.DADATA_REQUEST_TIMEOUT_MS);
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_DADATA_REQUEST_TIMEOUT_MS;
  }
}

function daDataDailyLimit() {
  const configured = Number.parseInt(process.env.DADATA_DAILY_LIMIT ?? '', 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_DADATA_DAILY_LIMIT;
}

function moscowDay(now: number) {
  return new Date(now + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

/** Next midnight in Moscow, as a UTC timestamp. */
function moscowDayEnd(now: number) {
  return Math.floor((now + MOSCOW_OFFSET_MS) / DAY_MS + 1) * DAY_MS - MOSCOW_OFFSET_MS;
}

function daDataBudgetKey(day: string) {
  return `address-dadata-day:${day}`;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
