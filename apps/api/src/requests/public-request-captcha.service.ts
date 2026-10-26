import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { createChallenge, verifySolution } from 'altcha-lib';
import type { Challenge, Solution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import {
  HttpMetricsService,
  type PublicRequestRejectionReason,
} from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';

const captchaFailedMessage =
  'Не удалось подтвердить, что заявку отправляет человек. Отправьте форму ещё раз.';

type CaptchaPayload = { challenge: Challenge; solution: Solution };

/**
 * Self-hosted proof-of-work CAPTCHA (ALTCHA, owner decision D3). The browser
 * solves a signed challenge while the visitor fills in the form; the server
 * checks the signature, expiry and solution, and accepts each challenge once.
 * Nothing is sent to third parties.
 */
@Injectable()
export class PublicRequestCaptchaService {
  // Development and tests without ALTCHA_HMAC_SECRET: challenges stay valid
  // only for the lifetime of the process. Production requires the variable.
  private readonly fallbackSecret = randomBytes(32).toString('hex');

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HttpMetricsService,
  ) {}

  createChallenge(): Promise<Challenge> {
    const maxCounter = setting('ALTCHA_MAX_COUNTER', 10_000, 2, 10_000_000);
    return createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: setting('ALTCHA_COST', 1_000, 1, 1_000_000),
      counter: randomInt(Math.ceil(maxCounter / 2), maxCounter + 1),
      deriveKey,
      expiresAt: new Date(Date.now() + setting('ALTCHA_EXPIRES_SECONDS', 1_200, 60, 86_400) * 1000),
      ...this.secrets(),
    });
  }

  /** Throws 400 with a CAPTCHA_* code unless the payload is a fresh, valid solution. */
  async verify(payload: string | undefined) {
    if (!payload) this.reject('captcha_missing', 'CAPTCHA_REQUIRED');
    const parsed = parsePayload(payload);
    const expiresAt = parsed?.challenge.parameters.expiresAt;
    if (!parsed || typeof expiresAt !== 'number') this.reject('captcha_invalid', 'CAPTCHA_INVALID');

    let result: Awaited<ReturnType<typeof verifySolution>>;
    try {
      result = await verifySolution({
        challenge: parsed.challenge,
        solution: parsed.solution,
        deriveKey,
        ...this.secrets(),
      });
    } catch {
      this.reject('captcha_invalid', 'CAPTCHA_INVALID');
    }
    if (result.expired) this.reject('captcha_expired', 'CAPTCHA_EXPIRED');
    if (!result.verified) this.reject('captcha_invalid', 'CAPTCHA_INVALID');

    // The nonce is covered by the signature, so each challenge is accepted once.
    const keyHash = createHash('sha256')
      .update(`altcha:${parsed.challenge.parameters.nonce}`)
      .digest('hex');
    const usage = await this.prisma.publicRequestRateLimit.upsert({
      where: { keyHash },
      create: { keyHash, requestCount: 1, expiresAt: new Date(expiresAt * 1000) },
      update: { requestCount: { increment: 1 } },
      select: { requestCount: true },
    });
    if (usage.requestCount > 1) this.reject('captcha_replayed', 'CAPTCHA_REPLAYED');
  }

  private secrets() {
    const master = process.env.ALTCHA_HMAC_SECRET?.trim() || this.fallbackSecret;
    return {
      hmacSignatureSecret: derive(master, 'altcha-challenge-signature'),
      hmacKeySignatureSecret: derive(master, 'altcha-key-signature'),
    };
  }

  private reject(reason: PublicRequestRejectionReason, code: string): never {
    this.metrics.recordPublicRequestRejection(reason);
    throw new BadRequestException({ message: captchaFailedMessage, code });
  }
}

function parsePayload(value: string): CaptchaPayload | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (!isRecord(payload) || !isRecord(payload.challenge) || !isRecord(payload.solution)) {
      return null;
    }
    const { challenge, solution } = payload;
    if (!isRecord(challenge.parameters) || typeof challenge.parameters.nonce !== 'string') {
      return null;
    }
    if (typeof solution.counter !== 'number' || typeof solution.derivedKey !== 'string') {
      return null;
    }
    return payload as CaptchaPayload;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function derive(master: string, purpose: string) {
  return createHmac('sha256', master).update(purpose).digest('hex');
}

function setting(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
