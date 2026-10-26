import { HttpMetricsService } from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicRequestSecurityService } from './public-request-security.service';

describe('PublicRequestSecurityService', () => {
  const environment = { ...process.env };

  afterEach(() => {
    process.env = { ...environment };
    jest.restoreAllMocks();
  });

  function createService(requestCount: number) {
    const prisma = {
      publicRequestRateLimit: {
        upsert: jest.fn().mockResolvedValue({ requestCount }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    return new PublicRequestSecurityService(prisma, new HttpMetricsService());
  }

  /** Counts per key hash, like the real table within one window. */
  function createCountingService() {
    const counts = new Map<string, number>();
    const upsert = jest.fn(({ where }: { where: { keyHash: string } }) => {
      const requestCount = (counts.get(where.keyHash) ?? 0) + 1;
      counts.set(where.keyHash, requestCount);
      return Promise.resolve({ requestCount });
    });
    const prisma = {
      publicRequestRateLimit: { upsert, deleteMany: jest.fn() },
    } as unknown as PrismaService;
    const metrics = new HttpMetricsService();
    return { service: new PublicRequestSecurityService(prisma, metrics), metrics, upsert };
  }

  it('allows requests within the configured limit', async () => {
    const service = createService(10);

    await expect(service.consume('203.0.113.10')).resolves.toBeUndefined();
  });

  it('returns HTTP 429 after the configured limit', async () => {
    const service = createService(11);

    await expect(service.consume('203.0.113.10')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('silently accepts a filled honeypot without storing the submission', () => {
    const service = createService(1);
    const receipt = service.getHoneypotReceipt('https://spam.example');

    expect(receipt).not.toBeNull();
    expect(receipt?.number).toMatch(/^\d{6}$/);
    expect(receipt?.createdAt).toBeInstanceOf(Date);
    expect(service.getHoneypotReceipt('   ')).toBeNull();
  });

  it('limits one phone number in any format, independently of the IP address', async () => {
    process.env.PUBLIC_REQUEST_CONTACT_LIMIT_MAX = '2';
    const { service, metrics } = createCountingService();

    await service.consumeContactBudget({ phone: '+7 (900) 111-22-33', email: 'a@example.test' });
    await service.consumeContactBudget({ phone: '89001112233', email: 'b@example.test' });
    await expect(
      service.consumeContactBudget({ phone: '9001112233', email: 'c@example.test' }),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'PUBLIC_REQUEST_CONTACT_LIMITED' },
    });
    expect(metrics.prometheus()).toContain(
      'gidravlika_public_request_rejections_total{reason="phone_limit"} 1',
    );
  });

  it('limits one email regardless of case and phone', async () => {
    process.env.PUBLIC_REQUEST_CONTACT_LIMIT_MAX = '1';
    const { service, metrics } = createCountingService();

    await service.consumeContactBudget({ phone: '+79001110001', email: 'Buyer@Example.test' });
    await expect(
      service.consumeContactBudget({ phone: '+79001110002', email: ' buyer@example.test ' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(metrics.prometheus()).toContain(
      'gidravlika_public_request_rejections_total{reason="email_limit"} 1',
    );
  });

  it('stops all public submissions when the global budget is spent and logs it once', async () => {
    process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_MAX = '2';
    const { service, metrics } = createCountingService();
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await service.consumeContactBudget({ phone: '+79001110001' });
    await service.consumeContactBudget({ phone: '+79001110002' });
    for (const phone of ['+79001110003', '+79001110004']) {
      await expect(service.consumeContactBudget({ phone })).rejects.toMatchObject({
        status: 429,
        response: { code: 'PUBLIC_REQUEST_BUDGET_EXHAUSTED' },
      });
    }

    const events = write.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('public_request.global_budget_exhausted'));
    expect(events).toHaveLength(1);
    expect(events[0]).not.toContain('+7900');
    expect(metrics.prometheus()).toContain(
      'gidravlika_public_request_rejections_total{reason="global_budget"} 2',
    );
  });

  it('does not spend the global budget for a request stopped by its contact limit', async () => {
    process.env.PUBLIC_REQUEST_CONTACT_LIMIT_MAX = '1';
    process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_MAX = '2';
    const { service } = createCountingService();

    await service.consumeContactBudget({ phone: '+79001110001' });
    await expect(service.consumeContactBudget({ phone: '+79001110001' })).rejects.toMatchObject({
      status: 429,
    });
    await expect(service.consumeContactBudget({ phone: '+79001110002' })).resolves.toBeUndefined();
  });
});
