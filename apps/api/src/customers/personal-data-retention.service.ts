import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../observability/structured-logger';
import { CustomersService } from './customers.service';

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const defaultRetentionDays = 1_095;
const defaultIntervalHours = 24;
const defaultBatchSize = 100;

export type RetentionRunReport = {
  cutoff: Date;
  dryRun: boolean;
  eligible: number;
  inspected: number;
  anonymized: number;
  skipped: number;
};

@Injectable()
export class PersonalDataRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  onModuleInit() {
    if (!enabled(process.env.PERSONAL_DATA_RETENTION_ENABLED)) return;

    void this.runScheduled();
    this.timer = setInterval(
      () => void this.runScheduled(),
      positiveInteger(process.env.PERSONAL_DATA_RETENTION_INTERVAL_HOURS, defaultIntervalHours) *
        60 *
        60 *
        1000,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(dryRun = enabled(process.env.PERSONAL_DATA_RETENTION_DRY_RUN)) {
    const retentionDays = positiveInteger(
      process.env.PERSONAL_DATA_RETENTION_DAYS,
      defaultRetentionDays,
    );
    const batchSize = positiveInteger(
      process.env.PERSONAL_DATA_RETENTION_BATCH_SIZE,
      defaultBatchSize,
    );
    const cutoff = new Date(Date.now() - retentionDays * millisecondsPerDay);
    const where: Prisma.CustomerWhereInput = {
      anonymizedAt: null,
      updatedAt: { lte: cutoff },
      requests: {
        every: {
          status: { in: ['COMPLETED', 'CANCELLED'] },
          updatedAt: { lte: cutoff },
        },
      },
    };
    const [eligible, candidates] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: { id: true },
        orderBy: { updatedAt: 'asc' },
        take: batchSize,
      }),
    ]);

    let anonymized = 0;
    let skipped = 0;
    if (!dryRun) {
      for (const candidate of candidates) {
        if (await this.customers.anonymizeCustomerByRetention(candidate.id, cutoff))
          anonymized += 1;
        else skipped += 1;
      }
    }

    const report: RetentionRunReport = {
      cutoff,
      dryRun,
      eligible,
      inspected: candidates.length,
      anonymized,
      skipped,
    };
    this.logger.info('personal_data.retention_completed', { ...report });
    return report;
  }

  private async runScheduled() {
    if (this.running) {
      this.logger.event('warn', 'personal_data.retention_skipped', { reason: 'already_running' });
      return;
    }
    this.running = true;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(error, undefined, PersonalDataRetentionService.name);
    } finally {
      this.running = false;
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}
