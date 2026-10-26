import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { StructuredLogger } from '../observability/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInitialAdminDto } from './dto/create-initial-admin.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password-hash';

const sessionDurationMs = 1000 * 60 * 60 * 48;
const twoFactorChallengeDurationMs = 1000 * 60 * 10;
const maxLoginAttemptsPerAddress = 20;
const loginAddressWindowMs = 1000 * 60;
const maxTwoFactorFailures = 5;
/**
 * Per-account backoff shared by every source: the attempt that reaches
 * `lockAt` failures locks the account for `lockBaseSeconds`, each later failure
 * doubles the pause up to `lockMaxSeconds`. Success or `windowMs` without
 * attempts resets the counter. Keys are derived from the typed login, so an
 * unknown login backs off exactly like a real one.
 */
type AttemptPolicy = {
  lockAt: number;
  windowMs: number;
  lockBaseSeconds: number;
  lockMaxSeconds: number;
};
const passwordAttemptPolicy: AttemptPolicy = {
  lockAt: 5,
  windowMs: 1000 * 60 * 60,
  lockBaseSeconds: 60,
  lockMaxSeconds: 15 * 60,
};
const twoFactorAttemptPolicy: AttemptPolicy = {
  lockAt: 10,
  windowMs: 1000 * 60 * 60 * 24,
  lockBaseSeconds: 60,
  lockMaxSeconds: 60 * 60,
};
const loginAttemptRetentionMs = 1000 * 60 * 60 * 24 * 30;
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
type Application = 'CRM' | 'BACKOFFICE';

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}
  private cleanupTimer?: NodeJS.Timeout;
  private readonly logger = new StructuredLogger();
  private dummyPasswordHash?: Promise<string>;

  async onModuleInit() {
    await this.removeExpiredSessions();
    this.cleanupTimer = setInterval(
      () => {
        void this.removeExpiredSessions();
      },
      1000 * 60 * 60 * 6,
    );
    this.cleanupTimer.unref();
  }
  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async bootstrapStatus() {
    if ((await this.prisma.user.count()) > 0) {
      throw new NotFoundException();
    }
    return {
      setupAvailable: true,
      setupSecretConfigured: Boolean(process.env.BOOTSTRAP_SECRET),
    };
  }

  async setup(dto: CreateInitialAdminDto, bootstrapSecret?: string) {
    if (await this.prisma.user.count())
      throw new ConflictException('Первый администратор уже создан.');
    if (!this.validBootstrapSecret(bootstrapSecret))
      throw new ForbiddenException(
        'Для создания первого администратора требуется корректный bootstrap-секрет.',
      );
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        login: dto.login.trim().toLowerCase(),
        passwordHash: await hashPassword(dto.password),
        role: 'ADMIN',
      },
    });
    return this.createTwoFactorChallenge(user.id, 'BACKOFFICE', 'SETUP');
  }

  async login(dto: LoginDto, application?: string, ipAddress?: string) {
    const sessionApplication = this.sessionApplication(application);
    const normalizedLogin = dto.login.trim().toLowerCase();
    const now = new Date();
    const addressAttemptCount = await this.consumeLoginAddressAttempt(
      ipAddress,
      now,
      sessionApplication,
    );
    await progressiveLoginDelay(addressAttemptCount);
    const accountAttemptKey = loginAccountKey(normalizedLogin);
    const accountAttempt = await this.claimAttempt(accountAttemptKey, passwordAttemptPolicy);
    // While locked the password is not checked at all, so the backoff cannot
    // be used to confirm a guess.
    if (!accountAttempt) throw loginAccountLocked();
    const user = await this.prisma.user.findUnique({
      where: { login: normalizedLogin },
    });
    // Always run scrypt so response time does not reveal whether the login exists.
    const passwordValid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await this.getDummyPasswordHash()),
    );
    // The application role is checked only after 2FA: a different answer here
    // would confirm the password to someone who does not have the second factor.
    if (!user || !user.isActive || !passwordValid) {
      await this.recordAuthActivity(user?.id, 'AUTH_LOGIN_FAILED', {
        application: sessionApplication,
        accountPressure: accountAttempt.failureCount >= passwordAttemptPolicy.lockAt,
      });
      if (accountAttempt.lockedUntil)
        await this.reportAccountLock('AUTH_LOGIN_ACCOUNT_LOCKED', user?.id, {
          application: sessionApplication,
          failures: accountAttempt.failureCount,
          lockedUntil: accountAttempt.lockedUntil,
        });
      throw new UnauthorizedException('Неверный логин или пароль.');
    }
    await this.prisma.loginAttempt.deleteMany({ where: { key: accountAttemptKey } });
    await this.upgradePasswordHash(user.id, user.passwordHash, dto.password);
    return this.createTwoFactorChallenge(
      user.id,
      sessionApplication,
      user.twoFactorEnabled ? 'VERIFY' : 'SETUP',
    );
  }

  async twoFactorChallenge(challengeToken?: string) {
    const challenge = await this.getChallenge(challengeToken);
    if (challenge.type !== 'SETUP' || !challenge.secret)
      throw new UnauthorizedException('Настройка двухфакторной аутентификации недоступна.');
    const secret = this.decryptSecret(challenge.secret);
    const label = `${this.twoFactorIssuer}:${challenge.user.name}`;
    const otpAuthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(this.twoFactorIssuer)}&algorithm=SHA1&digits=6&period=30`;
    return {
      type: 'SETUP',
      otpAuthUrl,
      qrDataUrl: await QRCode.toDataURL(otpAuthUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
      }),
      manualKey: secret,
      expiresAt: challenge.expiresAt,
    };
  }

  async verifyTwoFactor(dto: VerifyTwoFactorDto, challengeToken?: string) {
    const challenge = await this.getChallenge(challengeToken);
    const attemptClaimed = await this.prisma.authTwoFactorChallenge.updateMany({
      where: { id: challenge.id, attempts: { lt: maxTwoFactorFailures } },
      data: { attempts: { increment: 1 } },
    });
    if (attemptClaimed.count !== 1) {
      await this.prisma.authTwoFactorChallenge.deleteMany({ where: { id: challenge.id } });
      throw twoFactorAttemptsExhausted();
    }
    const accountAttempt = await this.claimAttempt(
      twoFactorAccountKey(challenge.userId),
      twoFactorAttemptPolicy,
    );
    if (!accountAttempt) {
      await this.prisma.authTwoFactorChallenge.deleteMany({ where: { id: challenge.id } });
      throw twoFactorAccountLocked();
    }
    const code = normalizeTwoFactorCode(dto.code);
    let verified = this.isMockTwoFactorCode(code);
    let recoveryCodeUsed = false;
    let totpReplayRejected = false;
    let secret: string | undefined;
    if (challenge.type === 'SETUP' && challenge.secret)
      secret = this.decryptSecret(challenge.secret);
    else if (
      !verified &&
      challenge.type === 'VERIFY' &&
      challenge.user.twoFactorEnabled &&
      challenge.user.twoFactorSecret
    )
      secret = this.decryptSecret(challenge.user.twoFactorSecret);
    if (!verified && secret) {
      const counter = matchingTotpCounter(secret, code);
      if (counter !== null) {
        const consumed = await this.prisma.user.updateMany({
          where: {
            id: challenge.userId,
            OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: counter } }],
          },
          data: { lastTotpCounter: counter },
        });
        verified = consumed.count === 1;
        totpReplayRejected = !verified;
      }
    }
    if (!verified && challenge.type === 'VERIFY' && code) {
      const consumed = await this.prisma.authRecoveryCode.updateMany({
        where: {
          userId: challenge.userId,
          codeHash: hashToken(`recovery:${canonicalRecoveryCode(code)}`),
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      recoveryCodeUsed = consumed.count === 1;
      verified = recoveryCodeUsed;
    }
    if (!verified) {
      const attempts = challenge.attempts + 1;
      const accountLocked = accountAttempt.lockedUntil !== null;
      if (accountLocked || attempts >= maxTwoFactorFailures)
        await this.prisma.authTwoFactorChallenge.deleteMany({
          where: { id: challenge.id },
        });
      await this.recordAuthActivity(challenge.userId, 'AUTH_TWO_FACTOR_FAILED', {
        application: challenge.application,
        reason: totpReplayRejected ? 'TOTP_REPLAY' : 'INVALID_CODE',
      });
      if (accountAttempt.lockedUntil) {
        await this.reportAccountLock('AUTH_TWO_FACTOR_ACCOUNT_LOCKED', challenge.userId, {
          application: challenge.application,
          failures: accountAttempt.failureCount,
          lockedUntil: accountAttempt.lockedUntil,
        });
        throw twoFactorAccountLocked();
      }
      if (attempts >= maxTwoFactorFailures) throw twoFactorAttemptsExhausted();
      throw new UnauthorizedException('Неверный код из приложения-аутентификатора.');
    }
    await this.prisma.loginAttempt.deleteMany({
      where: { key: twoFactorAccountKey(challenge.userId) },
    });
    if (challenge.application === 'BACKOFFICE' && challenge.user.role !== 'ADMIN') {
      await this.prisma.authTwoFactorChallenge.deleteMany({ where: { id: challenge.id } });
      await this.recordAuthActivity(challenge.userId, 'AUTH_LOGIN_APP_FORBIDDEN', {
        application: challenge.application,
      });
      throw new ForbiddenException({
        code: 'APPLICATION_FORBIDDEN',
        message: 'Для входа в back office требуются права администратора.',
      });
    }
    let recoveryCodes: string[] | undefined;
    if (challenge.type === 'SETUP' && secret) {
      recoveryCodes = createRecoveryCodes();
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: challenge.userId },
          data: {
            twoFactorSecret: this.encryptSecret(secret),
            twoFactorEnabled: true,
            twoFactorEnabledAt: new Date(),
          },
        }),
        this.prisma.authRecoveryCode.deleteMany({
          where: { userId: challenge.userId },
        }),
        this.prisma.authRecoveryCode.createMany({
          data: recoveryCodes.map((recoveryCode) => ({
            userId: challenge.userId,
            codeHash: hashToken(`recovery:${recoveryCode}`),
          })),
        }),
        this.prisma.authTwoFactorChallenge.delete({
          where: { id: challenge.id },
        }),
      ]);
      await this.recordAuthActivity(challenge.userId, 'AUTH_TWO_FACTOR_ENABLED', {
        application: challenge.application,
      });
    } else {
      await this.prisma.authTwoFactorChallenge.delete({
        where: { id: challenge.id },
      });
      if (recoveryCodeUsed)
        await this.recordAuthActivity(challenge.userId, 'AUTH_RECOVERY_CODE_USED', {
          application: challenge.application,
        });
    }
    const session = await this.createSession(
      challenge.userId,
      this.sessionApplication(challenge.application),
    );
    return recoveryCodes ? { ...session, recoveryCodes } : session;
  }

  async getUser(authorization: string | undefined, application: string | undefined) {
    const requiredApplication = this.sessionApplication(application);
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Требуется авторизация.');
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || !session.user.isActive || !session.twoFactorVerified)
      throw new UnauthorizedException('Требуется двухфакторная аутентификация.');
    if (session.expiresAt <= new Date()) {
      await this.prisma.authSession.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Сессия истекла.');
    }
    if (session.application !== requiredApplication) {
      throw new ForbiddenException('Сессия не предназначена для этого приложения.');
    }
    return session.user;
  }

  async regenerateRecoveryCodes(
    authorization: string | undefined,
    application: string | undefined,
  ) {
    const user = await this.getUser(authorization, application);
    const sessionApplication = this.sessionApplication(application);
    const recoveryCodes = createRecoveryCodes();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`recovery-codes:${user.id}`}))
      `;
      await transaction.authRecoveryCode.deleteMany({ where: { userId: user.id } });
      await transaction.authRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId: user.id,
          codeHash: hashToken(`recovery:${recoveryCode}`),
        })),
      });
    });
    await this.recordAuthActivity(user.id, 'AUTH_RECOVERY_CODES_REGENERATED', {
      application: sessionApplication,
      count: recoveryCodes.length,
    });
    return { recoveryCodes };
  }

  async logout(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (token) {
      const session = await this.prisma.authSession.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, application: true },
      });
      if (session) {
        await this.prisma.authSession.delete({ where: { id: session.id } });
        await this.recordAuthActivity(session.userId, 'AUTH_LOGOUT', {
          application: session.application,
        });
      }
    }
    return { ok: true };
  }

  /**
   * Atomically counts an attempt under `policy` before the secret is checked,
   * so parallel requests share one budget. Returns null while the key is
   * locked. When the budget is spent the same statement sets the lock, which a
   * successful attempt then clears by deleting the row.
   */
  private async claimAttempt(key: string, policy: AttemptPolicy) {
    const now = Date.now();
    const nowTimestamp = utcTimestamp(now);
    const nextCount = Prisma.sql`CASE
      WHEN "LoginAttempt"."updatedAt" < ${utcTimestamp(now - policy.windowMs)} THEN 1
      ELSE "LoginAttempt"."failureCount" + 1
    END`;
    const [attempt] = await this.prisma.$queryRaw<
      Array<{ failureCount: number; lockedUntil: Date | null }>
    >`
      INSERT INTO "LoginAttempt" ("key", "failureCount", "updatedAt")
      VALUES (${key}, 1, ${nowTimestamp})
      ON CONFLICT ("key") DO UPDATE SET
        "failureCount" = ${nextCount},
        "lockedUntil" = CASE
          WHEN ${nextCount} >= ${policy.lockAt}::int
          THEN ${nowTimestamp} + make_interval(secs => LEAST(
            ${policy.lockBaseSeconds}::double precision *
              power(2, ${nextCount} - ${policy.lockAt}::int),
            ${policy.lockMaxSeconds}::double precision
          ))
          ELSE NULL
        END,
        "updatedAt" = ${nowTimestamp}
      WHERE "LoginAttempt"."lockedUntil" IS NULL OR "LoginAttempt"."lockedUntil" <= ${nowTimestamp}
      RETURNING "failureCount", "lockedUntil"
    `;
    return attempt ?? null;
  }

  private async reportAccountLock(
    action: 'AUTH_LOGIN_ACCOUNT_LOCKED' | 'AUTH_TWO_FACTOR_ACCOUNT_LOCKED',
    userId: string | undefined,
    lock: { application: string; failures: number; lockedUntil: Date },
  ) {
    const details = { ...lock, lockedUntil: lock.lockedUntil.toISOString() };
    this.logger.event(
      'warn',
      action === 'AUTH_LOGIN_ACCOUNT_LOCKED'
        ? 'auth.login.account_locked'
        : 'auth.two_factor.account_locked',
      { userId, ...details },
    );
    await this.recordAuthActivity(userId, action, details);
  }

  /** Rewrites a legacy or weaker hash after a successful login; never fails the login. */
  private async upgradePasswordHash(userId: string, saved: string, password: string) {
    if (!passwordNeedsRehash(saved)) return;
    try {
      // Compare-and-set: an administrator's password change in the meantime wins.
      await this.prisma.user.updateMany({
        where: { id: userId, passwordHash: saved },
        data: { passwordHash: await hashPassword(password) },
      });
    } catch (error) {
      this.logger.event('error', 'auth.password.rehash_failed', { userId, error });
    }
  }

  private getDummyPasswordHash() {
    this.dummyPasswordHash ??= hashPassword(randomBytes(32).toString('hex'));
    return this.dummyPasswordHash;
  }

  private async createTwoFactorChallenge(
    userId: string,
    application: Application,
    type: 'SETUP' | 'VERIFY',
  ) {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + twoFactorChallengeDurationMs);
    await this.prisma.authTwoFactorChallenge.deleteMany({ where: { userId } });
    await this.prisma.authTwoFactorChallenge.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        type,
        application,
        secret: type === 'SETUP' ? this.encryptSecret(generateBase32(32)) : undefined,
        expiresAt,
      },
    });
    return {
      twoFactorRequired: true,
      setupRequired: type === 'SETUP',
      challengeToken: token,
      expiresAt,
    };
  }

  private async getChallenge(challengeToken?: string) {
    if (!challengeToken) throw this.expiredTwoFactorChallenge();
    const challenge = await this.prisma.authTwoFactorChallenge.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
      include: { user: true },
    });
    if (!challenge || !challenge.user.isActive) throw this.expiredTwoFactorChallenge();
    if (challenge.expiresAt <= new Date()) {
      await this.prisma.authTwoFactorChallenge.delete({
        where: { id: challenge.id },
      });
      throw this.expiredTwoFactorChallenge();
    }
    return challenge;
  }

  private async createSession(userId: string, application: Application) {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionDurationMs);
    await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        application,
        twoFactorVerified: true,
        expiresAt,
      },
    });
    await this.recordAuthActivity(userId, 'AUTH_LOGIN_SUCCEEDED', { application });
    return { token, expiresAt };
  }

  private async removeExpiredSessions() {
    const result = await this.prisma.authSession.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await this.prisma.authTwoFactorChallenge.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await this.prisma.loginAttempt.deleteMany({
      where: {
        OR: [
          // Locked counters outlive the lock so the backoff keeps growing.
          { lockedUntil: { lte: new Date(Date.now() - twoFactorAttemptPolicy.windowMs) } },
          { updatedAt: { lte: new Date(Date.now() - loginAttemptRetentionMs) } },
        ],
      },
    });
    if (result.count)
      await this.recordAuthActivity(undefined, 'AUTH_EXPIRED_SESSIONS_CLEANED', {
        count: result.count,
      });
  }
  private validBootstrapSecret(secret?: string) {
    const expected = process.env.BOOTSTRAP_SECRET;
    if (!expected || !secret) return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(secret);
    return (
      expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
  private sessionApplication(application?: string): Application {
    if (application === 'CRM' || application === 'BACKOFFICE') return application;
    throw new BadRequestException('Укажите корректное приложение для авторизации.');
  }
  private async consumeLoginAddressAttempt(
    ipAddress: string | undefined,
    now: Date,
    application: Application,
  ) {
    const windowStart = Math.floor(now.getTime() / loginAddressWindowMs) * loginAddressWindowMs;
    const key = hashToken(`login-address:${normalizeClientAddress(ipAddress)}:${windowStart}`);
    const attempt = await this.prisma.loginAttempt.upsert({
      where: { key },
      create: {
        key,
        failureCount: 1,
        lockedUntil: new Date(windowStart + loginAddressWindowMs),
      },
      update: { failureCount: { increment: 1 } },
      select: { failureCount: true },
    });
    if (attempt.failureCount > maxLoginAttemptsPerAddress) {
      await this.recordAuthActivity(undefined, 'AUTH_LOGIN_ADDRESS_RATE_LIMITED', { application });
      throw new HttpException(
        'Слишком много попыток входа с этого адреса. Повторите через минуту.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return attempt.failureCount;
  }
  private expiredTwoFactorChallenge() {
    return new UnauthorizedException({
      code: 'TWO_FACTOR_CHALLENGE_EXPIRED',
      message: 'Срок подтверждения истёк. Войдите заново.',
    });
  }
  private get twoFactorIssuer() {
    return 'Гидравлика 25';
  }
  private isMockTwoFactorCode(code: string) {
    return (
      process.env.TWO_FACTOR_MODE?.trim().toLowerCase() === 'mock' &&
      code === (process.env.TWO_FACTOR_MOCK_CODE?.trim() || '000000')
    );
  }
  private encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.twoFactorEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }
  private decryptSecret(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue)
      throw new InternalServerErrorException(
        'Не удалось прочитать настройки двухфакторной аутентификации.',
      );
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.twoFactorEncryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Не удалось прочитать настройки двухфакторной аутентификации.',
      );
    }
  }
  private twoFactorEncryptionKey() {
    const source =
      process.env.TOTP_ENCRYPTION_KEY ?? process.env.BOOTSTRAP_SECRET ?? process.env.DATABASE_URL;
    if (!source)
      throw new InternalServerErrorException(
        'Для двухфакторной аутентификации требуется ключ шифрования.',
      );
    return createHash('sha256').update(`gidravlika25:totp:${source}`).digest();
  }
  private async recordAuthActivity(
    userId: string | undefined,
    action: string,
    details?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.backofficeActivity.create({
        data: {
          userId,
          action,
          entity: 'auth',
          details: details as Prisma.InputJsonValue | undefined,
        },
      });
    } catch {
      /* Authentication must stay available if audit is down. */
    }
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
/** Key of the per-account 2FA failure counter in `LoginAttempt`. */
export function twoFactorAccountKey(userId: string) {
  return hashToken(`two-factor-account:${userId}`);
}
/** `timestamp(3)` columns hold UTC; build the value in SQL to avoid session time zones. */
function utcTimestamp(epochMs: number) {
  return Prisma.sql`(to_timestamp(${epochMs}::double precision / 1000) AT TIME ZONE 'UTC')::timestamp(3)`;
}
function loginAccountKey(normalizedLogin: string) {
  return hashToken(`login-account:${normalizedLogin}`);
}
function loginAccountLocked() {
  return new HttpException(
    {
      code: 'LOGIN_ACCOUNT_LOCKED',
      message:
        'Слишком много неудачных попыток входа в эту учётную запись. Повторите через несколько минут.',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
function twoFactorAttemptsExhausted() {
  return new HttpException(
    {
      code: 'TWO_FACTOR_ATTEMPTS_EXHAUSTED',
      message: 'Слишком много неверных кодов. Войдите заново.',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
function twoFactorAccountLocked() {
  return new HttpException(
    {
      code: 'TWO_FACTOR_ACCOUNT_LOCKED',
      message:
        'Слишком много неверных кодов для этой учётной записи. Вход временно заблокирован, повторите позже.',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
function normalizeClientAddress(ipAddress?: string) {
  return ipAddress?.trim().toLowerCase() || 'unknown';
}
async function progressiveLoginDelay(attemptCount: number) {
  const delayMs = Math.min(Math.floor((attemptCount - 1) / 5) * 250, 750);
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
}
function generateBase32(length: number) {
  return Array.from(randomBytes(length), (byte) => base32Alphabet[byte & 31]).join('');
}
function decodeBase32(value: string) {
  let bits = '';
  for (const character of value.replace(/=|\s/g, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 value');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
function normalizeTwoFactorCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}
/** Recovery codes are stored as `XXXXX-XXXXX`; accept them typed without the dash or spaces. */
function canonicalRecoveryCode(code: string) {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}
function matchingTotpCounter(secret: string, code: string): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  for (const offset of [-1n, 0n, 1n]) {
    const candidate = counter + offset;
    if (timingSafeEqual(Buffer.from(totp(secret, candidate)), Buffer.from(code))) return candidate;
  }
  return null;
}
function totp(secret: string, counter: bigint) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}
function createRecoveryCodes() {
  return Array.from({ length: 8 }, () => `${generateBase32(5)}-${generateBase32(5)}`);
}
