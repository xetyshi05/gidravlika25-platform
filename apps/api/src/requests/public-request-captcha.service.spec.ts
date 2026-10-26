import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { HttpMetricsService } from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicRequestCaptchaService } from './public-request-captcha.service';

describe('PublicRequestCaptchaService', () => {
  const environment = { ...process.env };

  beforeEach(() => {
    process.env.ALTCHA_HMAC_SECRET = 'unit-test-altcha-secret-0000000000000000';
    process.env.ALTCHA_COST = '1';
    process.env.ALTCHA_MAX_COUNTER = '20';
  });

  afterEach(() => {
    process.env = { ...environment };
    jest.restoreAllMocks();
  });

  function createService() {
    const used = new Map<string, number>();
    const upsert = jest.fn(({ where }: { where: { keyHash: string } }) => {
      const requestCount = (used.get(where.keyHash) ?? 0) + 1;
      used.set(where.keyHash, requestCount);
      return Promise.resolve({ requestCount });
    });
    const prisma = { publicRequestRateLimit: { upsert } } as unknown as PrismaService;
    const metrics = new HttpMetricsService();
    return { service: new PublicRequestCaptchaService(prisma, metrics), metrics, upsert };
  }

  async function solve(challenge: Challenge) {
    const solution = await solveChallenge({ challenge, deriveKey });
    return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
  }

  function rejectsWith(promise: Promise<unknown>, code: string) {
    return expect(promise).rejects.toMatchObject({ status: 400, response: { code } });
  }

  it('issues signed, expiring PBKDF2 challenges and accepts a real solution', async () => {
    const { service, upsert } = createService();
    const challenge = await service.createChallenge();

    expect(challenge.parameters.algorithm).toBe('PBKDF2/SHA-256');
    expect(challenge.signature).toEqual(expect.any(String));
    expect(challenge.parameters.expiresAt).toBeGreaterThan(Date.now() / 1000);
    await expect(service.verify(await solve(challenge))).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('accepts each challenge only once', async () => {
    const { service, metrics } = createService();
    const payload = await solve(await service.createChallenge());

    await service.verify(payload);
    await rejectsWith(service.verify(payload), 'CAPTCHA_REPLAYED');
    expect(metrics.prometheus()).toContain(
      'gidravlika_public_request_rejections_total{reason="captcha_replayed"} 1',
    );
  });

  it('rejects a missing or malformed payload without touching the database', async () => {
    const { service, upsert } = createService();

    await rejectsWith(service.verify(undefined), 'CAPTCHA_REQUIRED');
    await rejectsWith(service.verify('not-base64-json'), 'CAPTCHA_INVALID');
    await rejectsWith(
      service.verify(
        Buffer.from(JSON.stringify({ challenge: {}, solution: {} })).toString('base64'),
      ),
      'CAPTCHA_INVALID',
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a solution to a tampered challenge', async () => {
    const { service } = createService();
    const challenge = await service.createChallenge();
    // A cheaper challenge the client made up itself.
    const tampered = {
      ...challenge,
      parameters: { ...challenge.parameters, cost: 1, keyPrefix: '' },
    };

    await rejectsWith(service.verify(await solve(tampered)), 'CAPTCHA_INVALID');
  });

  it('rejects a challenge signed with another secret', async () => {
    const { service } = createService();
    const payload = await solve(await service.createChallenge());
    process.env.ALTCHA_HMAC_SECRET = 'another-altcha-secret-000000000000000000';

    await rejectsWith(service.verify(payload), 'CAPTCHA_INVALID');
  });

  it('rejects an expired challenge', async () => {
    const { service, metrics } = createService();
    const payload = await solve(await service.createChallenge());
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 21 * 60_000);

    await rejectsWith(service.verify(payload), 'CAPTCHA_EXPIRED');
    expect(metrics.prometheus()).toContain(
      'gidravlika_public_request_rejections_total{reason="captcha_expired"} 1',
    );
  });
});
