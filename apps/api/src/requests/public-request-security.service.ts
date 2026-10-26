import { randomInt } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { normalizeEmail, normalizePhone } from '../customers/customer-normalization';
import {
  HttpMetricsService,
  type PublicRequestRejectionReason,
} from '../observability/http-metrics.service';
import { StructuredLogger } from '../observability/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { incrementRateLimitCounter } from '../prisma/rate-limit-counter';

const defaultWindowMs = 60_000;
const defaultRequestLimit = 10;
const defaultContactWindowMs = 60 * 60_000;
const defaultContactLimit = 5;
const defaultGlobalWindowMs = 60 * 60_000;
const defaultGlobalLimit = 200;
const cleanupIntervalMs = 1000 * 60 * 60;
const contactLimitedMessage =
  'Слишком много заявок с этими контактами. Повторите попытку позднее или позвоните нам.';
const budgetExhaustedMessage =
  'Сейчас мы получаем слишком много заявок. Повторите попытку позднее или позвоните нам.';

@Injectable()
export class PublicRequestSecurityService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;
  private readonly logger = new StructuredLogger();

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HttpMetricsService,
  ) {}

  async onModuleInit() {
    await this.removeExpiredRecords();
    this.cleanupTimer = setInterval(() => {
      void this.removeExpiredRecords().catch(() => undefined);
    }, cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async consume(ipAddress: string | undefined) {
    const windowMs = positiveInteger(
      process.env.PUBLIC_REQUEST_RATE_LIMIT_WINDOW_MS,
      defaultWindowMs,
    );
    const requestLimit = positiveInteger(
      process.env.PUBLIC_REQUEST_RATE_LIMIT_MAX,
      defaultRequestLimit,
    );
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const requestCount = await this.increment(
      `public-request:${ipAddress || 'unknown'}:${windowStart}`,
      windowStart + windowMs,
    );

    if (requestCount > requestLimit) {
      this.metrics.recordPublicRequestRejection('ip_limit');
      throw new HttpException(
        'Слишком много заявок. Повторите попытку позднее.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Budgets that a botnet cannot spread across many IP addresses (SEC-03):
   * per normalized phone, per normalized email and for all public forms
   * together. Called only after the CAPTCHA passed, so unsolved requests
   * cannot exhaust a real customer's or the whole site's budget.
   */
  async consumeContactBudget(contact: { phone: string; email?: string | null }) {
    const contactWindowMs = positiveInteger(
      process.env.PUBLIC_REQUEST_CONTACT_LIMIT_WINDOW_MS,
      defaultContactWindowMs,
    );
    const contactLimit = positiveInteger(
      process.env.PUBLIC_REQUEST_CONTACT_LIMIT_MAX,
      defaultContactLimit,
    );
    const phone = normalizePhone(contact.phone);
    if (phone) {
      await this.consumeBudget(`phone:${phone}`, contactLimit, contactWindowMs, 'phone_limit');
    }
    const email = normalizeEmail(contact.email);
    if (email) {
      await this.consumeBudget(`email:${email}`, contactLimit, contactWindowMs, 'email_limit');
    }
    await this.consumeBudget(
      'global',
      positiveInteger(process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_MAX, defaultGlobalLimit),
      positiveInteger(process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_WINDOW_MS, defaultGlobalWindowMs),
      'global_budget',
    );
  }

  private async consumeBudget(
    key: string,
    limit: number,
    windowMs: number,
    reason: PublicRequestRejectionReason,
  ) {
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const requestCount = await this.increment(
      `public-request-budget:${key}:${windowStart}`,
      windowStart + windowMs,
    );
    if (requestCount <= limit) return;

    this.metrics.recordPublicRequestRejection(reason);
    // One event per key and window: a spike is visible without flooding the
    // log. Contacts themselves are not logged.
    if (requestCount === limit + 1) {
      const globalBudget = reason === 'global_budget';
      this.logger.event(
        globalBudget ? 'warn' : 'info',
        globalBudget ? 'public_request.global_budget_exhausted' : 'public_request.contact_limited',
        { reason, limit, windowMs },
      );
    }
    throw new HttpException(
      reason === 'global_budget'
        ? { message: budgetExhaustedMessage, code: 'PUBLIC_REQUEST_BUDGET_EXHAUSTED' }
        : { message: contactLimitedMessage, code: 'PUBLIC_REQUEST_CONTACT_LIMITED' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private increment(key: string, expiresAt: number) {
    return incrementRateLimitCounter(this.prisma, key, expiresAt);
  }

  getHoneypotReceipt(value: string | undefined) {
    if (!value?.trim()) return null;
    this.metrics.recordPublicRequestRejection('honeypot');

    return {
      number: String(randomInt(100_000, 1_000_000)),
      createdAt: new Date(),
    };
  }

  private async removeExpiredRecords() {
    const expiredAt = new Date();
    await Promise.all([
      this.prisma.publicRequestRateLimit.deleteMany({
        where: { expiresAt: { lte: expiredAt } },
      }),
      this.prisma.publicRequestSubmission.deleteMany({
        where: { expiresAt: { lte: expiredAt } },
      }),
    ]);
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
