import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HttpMetricsService } from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';

// Operational endpoints for nginx, Docker and the monitor: not part of the apps' contract.
@Controller()
@ApiExcludeController()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: HttpMetricsService,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1::integer AS "ready"`;
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'down' },
      });
    }
  }

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() {
    return this.metricsService.prometheus();
  }
}
