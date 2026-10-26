import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpMetricsService } from '../observability/http-metrics.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports process liveness without querying dependencies', () => {
    const queryRaw = jest.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const controller = new HealthController(prisma, new HttpMetricsService());

    expect(controller.health()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL responds', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]),
    } as unknown as PrismaService;
    const controller = new HealthController(prisma, new HttpMetricsService());

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('returns service unavailable when PostgreSQL is down', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('database is down')),
    } as unknown as PrismaService;
    const controller = new HealthController(prisma, new HttpMetricsService());

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('publishes Prometheus metrics including the 5xx counter', () => {
    const prisma = {} as PrismaService;
    const metrics = new HttpMetricsService();
    metrics.recordResponse(500);
    const controller = new HealthController(prisma, metrics);

    expect(controller.metrics()).toContain('gidravlika_http_server_error_responses_total 1');
  });
});
