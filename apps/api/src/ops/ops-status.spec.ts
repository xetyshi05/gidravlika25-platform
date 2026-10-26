import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AddressService } from '../address/address.service';
import { CatalogImagesService } from '../backoffice/catalog-images.service';
import { HttpMetricsService } from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsStatusController } from './ops-status.controller';
import { OpsStatusService } from './ops-status.service';

function setup() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    operationHeartbeat: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'backup',
        succeededAt: new Date(Date.now() - 3 * 3_600_000),
        details: { archive: 'gidravlika-20260925T010000Z.dump', offsite: false },
      }),
    },
    storageCleanup: { count: jest.fn().mockResolvedValue(0) },
  };
  const metrics = new HttpMetricsService();
  const address = {
    daDataBudget: jest.fn().mockResolvedValue({ day: '2026-09-25', used: 10, limit: 9000 }),
  };
  const images = { probeStorage: jest.fn().mockResolvedValue({ bucket: null, originals: null }) };
  const service = new OpsStatusService(
    prisma as unknown as PrismaService,
    metrics,
    address as unknown as AddressService,
    images as unknown as CatalogImagesService,
  );
  return { service, prisma, metrics, address, images };
}

describe('OpsStatusService', () => {
  beforeEach(() => {
    process.env.DADATA_API_KEY = 'key';
  });
  afterEach(() => {
    delete process.env.DADATA_API_KEY;
    delete process.env.OPS_BACKUP_MAX_AGE_HOURS;
  });

  it('reports ok when every dependency is healthy', async () => {
    const { service } = setup();

    const status = await service.status();

    expect(status.status).toBe('ok');
    expect(Object.keys(status.checks)).toEqual([
      'database',
      'storage',
      'http',
      'dadata',
      'backup',
      'mediaCleanup',
    ]);
    expect(Object.values(status.checks).every((check) => check.status === 'ok')).toBe(true);
    expect(status.checks.backup).toMatchObject({ ageHours: 3 });
  });

  it('fails on 5xx, a stale backup, an unreachable bucket and a broken check', async () => {
    const { service, prisma, metrics, images } = setup();
    for (let index = 0; index < 5; index += 1) metrics.recordResponse(500, 20, '/catalog');
    prisma.operationHeartbeat.findUnique.mockResolvedValue({
      name: 'backup',
      succeededAt: new Date(Date.now() - 30 * 3_600_000),
      details: null,
    });
    images.probeStorage.mockResolvedValue({ bucket: 'AccessDenied', originals: null });
    prisma.storageCleanup.count.mockRejectedValue(new Error('relation does not exist'));

    const { status, checks } = await service.status();

    expect(status).toBe('fail');
    expect(checks.http).toMatchObject({ status: 'fail', serverErrors: 5 });
    expect(checks.backup.status).toBe('fail');
    expect(checks.backup.message).toContain('30 ч назад');
    expect(checks.storage).toMatchObject({
      status: 'fail',
      message: 'S3 недоступно: AccessDenied',
    });
    expect(checks.mediaCleanup.message).toContain('relation does not exist');
    expect(checks.database.status).toBe('ok');
  });

  it('warns about slow responses, a spent DaData budget share and stuck deletions', async () => {
    const { service, prisma, metrics, address } = setup();
    for (let index = 0; index < 20; index += 1) metrics.recordResponse(200, 4_000, '/catalog');
    address.daDataBudget.mockResolvedValue({ day: '2026-09-25', used: 7_200, limit: 9_000 });
    prisma.storageCleanup.count.mockResolvedValue(2);

    const { status, checks } = await service.status();

    expect(status).toBe('warn');
    expect(checks.http).toMatchObject({ status: 'warn', p95Ms: 5_000 });
    expect(checks.dadata).toMatchObject({ status: 'warn', used: 7_200 });
    expect(checks.mediaCleanup).toMatchObject({ status: 'warn', stuck: 2 });
  });

  it('fails when DaData errors outnumber successes or the budget is spent', async () => {
    const { service, metrics, address } = setup();
    for (let index = 0; index < 3; index += 1) metrics.recordDaDataRequest('timeout');
    expect((await service.status()).checks.dadata.status).toBe('fail');

    const spent = setup();
    spent.address.daDataBudget.mockResolvedValue({ day: '2026-09-25', used: 9_001, limit: 9_000 });
    expect((await spent.service.status()).checks.dadata.message).toContain('исчерпан');
    expect(address.daDataBudget).toHaveBeenCalled();
  });

  it('fails without any backup heartbeat', async () => {
    const { service, prisma } = setup();
    prisma.operationHeartbeat.findUnique.mockResolvedValue(null);

    expect((await service.status()).checks.backup).toMatchObject({
      status: 'fail',
      message: 'Нет записи об успешном backup.',
    });
  });
});

describe('OpsStatusController', () => {
  afterEach(() => delete process.env.OPS_STATUS_TOKEN);

  it('is absent without a token and requires the exact bearer token', async () => {
    const ops = { status: jest.fn().mockResolvedValue({ status: 'ok' }) };
    const controller = new OpsStatusController(ops as unknown as OpsStatusService);

    expect(() => controller.status('Bearer anything')).toThrow(NotFoundException);
    process.env.OPS_STATUS_TOKEN = 'x'.repeat(32);
    expect(() => controller.status()).toThrow(UnauthorizedException);
    expect(() => controller.status(`Bearer ${'x'.repeat(31)}`)).toThrow(UnauthorizedException);
    await expect(controller.status(`Bearer ${'x'.repeat(32)}`)).resolves.toEqual({
      status: 'ok',
    });
    expect(ops.status).toHaveBeenCalledTimes(1);
  });
});
