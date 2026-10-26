import { createHash, randomBytes, scryptSync } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword, verifyPassword } from './password-hash';

describe('AuthService application scope', () => {
  const activeUser = {
    id: 'user-1',
    name: 'Администратор',
    login: 'admin',
    role: 'ADMIN',
    isActive: true,
  };

  const openAccountBudget = () =>
    jest.fn().mockResolvedValue([{ failureCount: 1, lockedUntil: null }]);

  function createService(application: string) {
    const prisma = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          application,
          twoFactorVerified: true,
          expiresAt: new Date(Date.now() + 60_000),
          user: activeUser,
        }),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;

    return new AuthService(prisma);
  }

  it('exposes bootstrap configuration only before the first user exists', async () => {
    const previousSecret = process.env.BOOTSTRAP_SECRET;
    process.env.BOOTSTRAP_SECRET = 'configured-bootstrap-secret';
    const service = new AuthService({
      user: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService);

    try {
      await expect(service.bootstrapStatus()).resolves.toEqual({
        setupAvailable: true,
        setupSecretConfigured: true,
      });
    } finally {
      if (previousSecret === undefined) delete process.env.BOOTSTRAP_SECRET;
      else process.env.BOOTSTRAP_SECRET = previousSecret;
    }
  });

  it('hides bootstrap status after the first user has been created', async () => {
    const service = new AuthService({
      user: { count: jest.fn().mockResolvedValue(1) },
    } as unknown as PrismaService);

    await expect(service.bootstrapStatus()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a CRM session in back office', async () => {
    const service = createService('CRM');

    await expect(service.getUser('Bearer crm-token', 'BACKOFFICE')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a back office session in CRM', async () => {
    const service = createService('BACKOFFICE');

    await expect(service.getUser('Bearer backoffice-token', 'CRM')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('accepts a session only in its own application', async () => {
    const service = createService('CRM');

    await expect(service.getUser('Bearer crm-token', 'CRM')).resolves.toBe(activeUser);
  });

  it('rejects login without an explicit known application', async () => {
    const service = createService('CRM');

    await expect(service.login({ login: 'admin', password: 'password' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.login({ login: 'admin', password: 'password' }, 'UNKNOWN'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate limits a login source without locking a known account', async () => {
    const findUser = jest.fn();
    const prisma = {
      loginAttempt: {
        upsert: jest.fn().mockResolvedValue({ failureCount: 21 }),
      },
      user: { findUnique: findUser },
      backofficeActivity: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    const promise = service.login(
      { login: 'known-user', password: 'wrong-password' },
      'CRM',
      '203.0.113.10',
    );

    await expect(promise).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('does not check the password while the account is backing off', async () => {
    const findUser = jest.fn();
    const prisma = {
      loginAttempt: { upsert: jest.fn().mockResolvedValue({ failureCount: 1 }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: findUser },
      backofficeActivity: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await expect(
      service.login(
        { login: activeUser.login, password: 'correct-password' },
        'CRM',
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'LOGIN_ACCOUNT_LOCKED' },
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('expires the 2FA challenge and returns a distinct error after five wrong codes', async () => {
    const deleteChallenge = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      authTwoFactorChallenge: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'challenge-1',
          userId: activeUser.id,
          type: 'VERIFY',
          application: 'CRM',
          secret: null,
          attempts: 4,
          expiresAt: new Date(Date.now() + 60_000),
          user: { ...activeUser, twoFactorEnabled: false, twoFactorSecret: null },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: deleteChallenge,
      },
      authRecoveryCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: openAccountBudget(),
      backofficeActivity: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    try {
      await service.verifyTwoFactor({ code: '000000' }, 'challenge-token');
      throw new Error('Expected verifyTwoFactor to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'TWO_FACTOR_ATTEMPTS_EXHAUSTED',
      });
    }
    expect(deleteChallenge).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
    });
  });

  it('accepts the configured mock 2FA code in development without consuming a TOTP counter', async () => {
    const previousMode = process.env.TWO_FACTOR_MODE;
    const previousCode = process.env.TWO_FACTOR_MOCK_CODE;
    process.env.TWO_FACTOR_MODE = 'mock';
    process.env.TWO_FACTOR_MOCK_CODE = '123456';
    const consumeCounter = jest.fn();
    const prisma = {
      user: { updateMany: consumeCounter },
      authTwoFactorChallenge: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'challenge-1',
          userId: activeUser.id,
          type: 'VERIFY',
          application: 'CRM',
          secret: null,
          attempts: 0,
          expiresAt: new Date(Date.now() + 60_000),
          user: { ...activeUser, twoFactorEnabled: true, twoFactorSecret: 'unused' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: openAccountBudget(),
      loginAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      authRecoveryCode: { updateMany: jest.fn() },
      authSession: { create: jest.fn().mockResolvedValue({}) },
      backofficeActivity: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    try {
      const session = await service.verifyTwoFactor({ code: '123456' }, 'challenge-token');
      expect(typeof session.token).toBe('string');
      expect(consumeCounter).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.TWO_FACTOR_MODE;
      else process.env.TWO_FACTOR_MODE = previousMode;
      if (previousCode === undefined) delete process.env.TWO_FACTOR_MOCK_CODE;
      else process.env.TWO_FACTOR_MOCK_CODE = previousCode;
    }
  });

  it('atomically rejects a TOTP code that was already accepted', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(59_000));
    const previousEncryptionKey = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = 'test-encryption-key';
    const consumeCounter = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const createSession = jest.fn().mockResolvedValue({ id: 'session-1' });
    const updateChallenge = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      user: { updateMany: consumeCounter },
      authTwoFactorChallenge: {
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        updateMany: updateChallenge,
      },
      $queryRaw: openAccountBudget(),
      loginAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      authRecoveryCode: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      authSession: { create: createSession },
      backofficeActivity: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);
    const encryptSecret = (
      service as unknown as { encryptSecret: (secret: string) => string }
    ).encryptSecret.bind(service);
    (prisma.authTwoFactorChallenge.findUnique as jest.Mock).mockResolvedValue({
      id: 'challenge-1',
      userId: activeUser.id,
      type: 'VERIFY',
      application: 'CRM',
      secret: null,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        ...activeUser,
        twoFactorEnabled: true,
        twoFactorSecret: encryptSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),
      },
    });

    const firstSession = await service.verifyTwoFactor({ code: '287082' }, 'challenge-token');
    expect(typeof firstSession.token).toBe('string');
    await expect(
      service.verifyTwoFactor({ code: '287082' }, 'challenge-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(consumeCounter).toHaveBeenNthCalledWith(1, {
      where: {
        id: activeUser.id,
        OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: 1n } }],
      },
      data: { lastTotpCounter: 1n },
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(updateChallenge).toHaveBeenCalledWith({
      where: { id: 'challenge-1', attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });

    if (previousEncryptionKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = previousEncryptionKey;
    jest.useRealTimers();
  });

  it('lets an authenticated user replace all recovery codes', async () => {
    const deleteCodes = jest.fn().mockResolvedValue({ count: 8 });
    let createdCodes: { userId: string; codeHash: string }[] = [];
    const createCodes = jest.fn((args: { data: { userId: string; codeHash: string }[] }) => {
      createdCodes = args.data;
      return Promise.resolve({ count: 8 });
    });
    const lock = jest.fn().mockResolvedValue(1);
    const transactionClient = {
      $executeRaw: lock,
      authRecoveryCode: { deleteMany: deleteCodes, createMany: createCodes },
    };
    const prisma = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          application: 'CRM',
          twoFactorVerified: true,
          expiresAt: new Date(Date.now() + 60_000),
          user: activeUser,
        }),
      },
      $transaction: jest.fn((callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
      ),
      backofficeActivity: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    const result = await service.regenerateRecoveryCodes('Bearer session-token', 'CRM');

    expect(result.recoveryCodes).toHaveLength(8);
    expect(new Set(result.recoveryCodes).size).toBe(8);
    expect(deleteCodes).toHaveBeenCalledWith({ where: { userId: activeUser.id } });
    expect(createdCodes).toHaveLength(8);
    expect(createdCodes.every(({ userId }) => userId === activeUser.id)).toBe(true);
    expect(createdCodes.every(({ codeHash }) => /^[a-f0-9]{64}$/.test(codeHash))).toBe(true);
  });

  describe('login and 2FA hardening', () => {
    const managerLogin = { login: 'manager', password: 'correct-password' };
    const verifyChallenge = (overrides: Record<string, unknown> = {}) => ({
      id: 'challenge-1',
      userId: 'manager-1',
      type: 'VERIFY',
      application: 'BACKOFFICE',
      secret: null,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        ...activeUser,
        id: 'manager-1',
        role: 'MANAGER',
        // Codes are accepted through TWO_FACTOR_MODE=mock or checked as recovery codes.
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
      ...overrides,
    });

    function loginPrisma(user: unknown, queryRaw = openAccountBudget()) {
      return {
        loginAttempt: {
          upsert: jest.fn().mockResolvedValue({ failureCount: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        $queryRaw: queryRaw,
        user: {
          findUnique: jest.fn().mockResolvedValue(user),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        authTwoFactorChallenge: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'challenge-1' }),
        },
        backofficeActivity: { create: jest.fn().mockResolvedValue({}) },
      };
    }

    function verifyPrisma(queryRaw = openAccountBudget()) {
      return {
        authTwoFactorChallenge: {
          findUnique: jest.fn().mockResolvedValue(verifyChallenge()),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          delete: jest.fn().mockResolvedValue({}),
        },
        $queryRaw: queryRaw,
        loginAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { updateMany: jest.fn() },
        authRecoveryCode: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        authSession: { create: jest.fn().mockResolvedValue({}) },
        backofficeActivity: { create: jest.fn().mockResolvedValue({}) },
      };
    }

    async function withMockTwoFactor<T>(callback: () => Promise<T>) {
      const previousMode = process.env.TWO_FACTOR_MODE;
      const previousCode = process.env.TWO_FACTOR_MOCK_CODE;
      process.env.TWO_FACTOR_MODE = 'mock';
      process.env.TWO_FACTOR_MOCK_CODE = '123456';
      try {
        return await callback();
      } finally {
        if (previousMode === undefined) delete process.env.TWO_FACTOR_MODE;
        else process.env.TWO_FACTOR_MODE = previousMode;
        if (previousCode === undefined) delete process.env.TWO_FACTOR_MOCK_CODE;
        else process.env.TWO_FACTOR_MOCK_CODE = previousCode;
      }
    }

    it('does not reveal a correct manager password when logging in to back office', async () => {
      const passwordHash = await hashPassword('correct-password');
      const manager = { ...activeUser, role: 'MANAGER', passwordHash, twoFactorEnabled: true };
      const service = new AuthService(loginPrisma(manager) as unknown as PrismaService);

      await expect(
        service.login(managerLogin, 'BACKOFFICE', '203.0.113.10'),
      ).resolves.toMatchObject({ twoFactorRequired: true });
      await expect(
        service.login(
          { ...managerLogin, password: 'wrong-password' },
          'BACKOFFICE',
          '203.0.113.10',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('runs scrypt for an unknown login so timing does not reveal accounts', async () => {
      const service = new AuthService(loginPrisma(null) as unknown as PrismaService);
      const dummyHash = jest.spyOn(
        service as unknown as { getDummyPasswordHash: () => Promise<string> },
        'getDummyPasswordHash',
      );

      await expect(
        service.login({ login: 'nobody', password: 'password' }, 'CRM', '203.0.113.10'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(dummyHash).toHaveBeenCalledTimes(1);
    });

    it('locks the login and raises an alert on the failure that spends the budget', async () => {
      const lockedUntil = new Date(Date.now() + 60_000);
      const prisma = loginPrisma(
        null,
        jest.fn().mockResolvedValue([{ failureCount: 5, lockedUntil }]),
      );
      const service = new AuthService(prisma as unknown as PrismaService);

      await expect(
        service.login({ login: 'nobody', password: 'guess' }, 'CRM', '203.0.113.10'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.backofficeActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'AUTH_LOGIN_ACCOUNT_LOCKED' }) as unknown,
      });
    });

    it('upgrades a legacy password hash after a successful login', async () => {
      const salt = randomBytes(16).toString('hex');
      const legacyHash = `${salt}:${scryptSync('correct-password', salt, 64).toString('hex')}`;
      const manager = {
        ...activeUser,
        role: 'MANAGER',
        passwordHash: legacyHash,
        twoFactorEnabled: true,
      };
      const prisma = loginPrisma(manager);
      const service = new AuthService(prisma as unknown as PrismaService);

      await service.login(managerLogin, 'CRM', '203.0.113.10');

      const [update] = prisma.user.updateMany.mock.calls[0] as [
        { where: { passwordHash: string }; data: { passwordHash: string } },
      ];
      expect(update.where).toEqual({ id: activeUser.id, passwordHash: legacyHash });
      expect(update.data.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
      await expect(verifyPassword('correct-password', update.data.passwordHash)).resolves.toBe(
        true,
      );
    });

    it('does not rehash a current hash and survives a failed rehash', async () => {
      const current = {
        ...activeUser,
        passwordHash: await hashPassword('correct-password'),
        twoFactorEnabled: true,
      };
      const prisma = loginPrisma(current);
      await new AuthService(prisma as unknown as PrismaService).login(managerLogin, 'CRM', 'x');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();

      const salt = randomBytes(16).toString('hex');
      const legacy = {
        ...current,
        passwordHash: `${salt}:${scryptSync('correct-password', salt, 64).toString('hex')}`,
      };
      const failing = loginPrisma(legacy);
      failing.user.updateMany.mockRejectedValue(new Error('database is read-only'));
      await expect(
        new AuthService(failing as unknown as PrismaService).login(managerLogin, 'CRM', 'x'),
      ).resolves.toMatchObject({ twoFactorRequired: true });
    });

    it('checks the back office role only after a valid second factor', async () => {
      const prisma = verifyPrisma();
      const service = new AuthService(prisma as unknown as PrismaService);

      await withMockTwoFactor(async () => {
        await expect(service.verifyTwoFactor({ code: '000001' }, 'token')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        await expect(service.verifyTwoFactor({ code: '123456' }, 'token')).rejects.toMatchObject({
          status: HttpStatus.FORBIDDEN,
          response: { code: 'APPLICATION_FORBIDDEN' },
        });
      });
      expect(prisma.authSession.create).not.toHaveBeenCalled();
      expect(prisma.authTwoFactorChallenge.deleteMany).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
      });
    });

    it('refuses to check a code while the account 2FA budget is locked', async () => {
      const prisma = verifyPrisma(jest.fn().mockResolvedValue([]));
      const service = new AuthService(prisma as unknown as PrismaService);

      await withMockTwoFactor(async () => {
        await expect(service.verifyTwoFactor({ code: '123456' }, 'token')).rejects.toMatchObject({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: { code: 'TWO_FACTOR_ACCOUNT_LOCKED' },
        });
      });
      expect(prisma.authRecoveryCode.updateMany).not.toHaveBeenCalled();
      expect(prisma.authSession.create).not.toHaveBeenCalled();
      expect(prisma.authTwoFactorChallenge.deleteMany).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
      });
    });

    it('does not check a code once concurrent attempts used up the challenge', async () => {
      const prisma = verifyPrisma();
      prisma.authTwoFactorChallenge.updateMany.mockResolvedValue({ count: 0 });
      const service = new AuthService(prisma as unknown as PrismaService);

      await expect(service.verifyTwoFactor({ code: '123456' }, 'token')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        response: { code: 'TWO_FACTOR_ATTEMPTS_EXHAUSTED' },
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.authRecoveryCode.updateMany).not.toHaveBeenCalled();
    });

    it('locks the account and raises an alert when the budget is spent on a wrong code', async () => {
      const lockedUntil = new Date(Date.now() + 60_000);
      const prisma = verifyPrisma(jest.fn().mockResolvedValue([{ failureCount: 10, lockedUntil }]));
      const service = new AuthService(prisma as unknown as PrismaService);

      await expect(service.verifyTwoFactor({ code: '000001' }, 'token')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        response: { code: 'TWO_FACTOR_ACCOUNT_LOCKED' },
      });
      expect(prisma.backofficeActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'manager-1',
          action: 'AUTH_TWO_FACTOR_ACCOUNT_LOCKED',
        }) as unknown,
      });
    });

    it('accepts a recovery code in the format it was issued, with or without the dash', async () => {
      const issued = 'ABCDE-FGH23';
      const issuedHash = createHash('sha256').update(`recovery:${issued}`).digest('hex');
      for (const typed of [issued, 'abcde fgh23', 'ABCDEFGH23']) {
        const prisma = verifyPrisma();
        prisma.authTwoFactorChallenge.findUnique.mockResolvedValue(
          verifyChallenge({ application: 'CRM' }),
        );
        prisma.authRecoveryCode.updateMany.mockResolvedValue({ count: 1 });
        const service = new AuthService(prisma as unknown as PrismaService);

        await expect(service.verifyTwoFactor({ code: typed }, 'token')).resolves.toHaveProperty(
          'token',
        );
        expect(prisma.authRecoveryCode.updateMany).toHaveBeenCalledWith({
          where: { userId: 'manager-1', codeHash: issuedHash, usedAt: null },
          data: { usedAt: expect.any(Date) as unknown },
        });
      }
    });

    it('clears the account 2FA counter after a valid code', async () => {
      const prisma = verifyPrisma();
      prisma.authTwoFactorChallenge.findUnique.mockResolvedValue(
        verifyChallenge({ application: 'CRM' }),
      );
      const service = new AuthService(prisma as unknown as PrismaService);

      await withMockTwoFactor(() => service.verifyTwoFactor({ code: '123456' }, 'token'));

      expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({
        where: { key: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown },
      });
      expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
    });
  });
});
