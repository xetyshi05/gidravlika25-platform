import { Injectable } from '@nestjs/common';
import { AddressService, DADATA_BUDGET_WARNING_SHARE } from '../address/address.service';
import { CatalogImagesService } from '../backoffice/catalog-images.service';
import { HttpMetricsService } from '../observability/http-metrics.service';
import { PrismaService } from '../prisma/prisma.service';

export type CheckStatus = 'ok' | 'warn' | 'fail';
export type OpsCheck = { status: CheckStatus; message: string } & Record<string, unknown>;
export type OpsStatus = {
  status: CheckStatus;
  checkedAt: string;
  checks: Record<string, OpsCheck>;
};

const defaults = {
  serverErrors: 5,
  p95Ms: 2_500,
  minimumRequestsForLatency: 20,
  daDataFailures: 3,
  backupMaxAgeHours: 26,
  stuckCleanupAttempts: 3,
};
const severity: Record<CheckStatus, number> = { ok: 0, warn: 1, fail: 2 };

/**
 * Operations status for the external monitor (REL-03): one call answers
 * whether the database, storage, error rate, latency, DaData budget, backup
 * and file cleanup are healthy. Every check reports a short Russian message
 * that becomes the alert text.
 */
@Injectable()
export class OpsStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HttpMetricsService,
    private readonly address: AddressService,
    private readonly images: CatalogImagesService,
  ) {}

  async status(): Promise<OpsStatus> {
    const entries = await Promise.all(
      (
        [
          ['database', () => this.database()],
          ['storage', () => this.storage()],
          ['http', () => Promise.resolve(this.http())],
          ['dadata', () => this.daData()],
          ['backup', () => this.backup()],
          ['mediaCleanup', () => this.mediaCleanup()],
        ] as const
      ).map(async ([name, check]) => {
        try {
          return [name, await check()] as const;
        } catch (error) {
          return [name, fail(`Проверка не выполнена: ${errorMessage(error)}`)] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries) as Record<string, OpsCheck>;
    const status = Object.values(checks).reduce<CheckStatus>(
      (worst, check) => (severity[check.status] > severity[worst] ? check.status : worst),
      'ok',
    );
    return { status, checkedAt: new Date().toISOString(), checks };
  }

  private async database(): Promise<OpsCheck> {
    const startedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1::integer AS "ok"`;
    return ok('PostgreSQL отвечает.', { latencyMs: Date.now() - startedAt });
  }

  private async storage(): Promise<OpsCheck> {
    const { bucket, originals } = await this.images.probeStorage();
    if (bucket) return fail(`S3 недоступно: ${bucket}`);
    if (originals) return fail(`Каталог оригиналов недоступен для записи: ${originals}`);
    return ok('S3 и каталог оригиналов доступны.');
  }

  private http(): OpsCheck {
    const stats = this.metrics.recentStats();
    const errorLimit = setting('OPS_ALERT_SERVER_ERRORS', defaults.serverErrors);
    const p95Limit = setting('OPS_ALERT_P95_MS', defaults.p95Ms);
    const p95Ms = stats.p95Ms === null || Number.isFinite(stats.p95Ms) ? stats.p95Ms : '>10000';
    const values = {
      windowMinutes: stats.windowMinutes,
      requests: stats.requests,
      serverErrors: stats.serverErrors,
      p95Ms,
    };
    if (stats.serverErrors >= errorLimit)
      return fail(
        `${stats.serverErrors} ответов 5xx за ${stats.windowMinutes} мин (порог ${errorLimit}).`,
        values,
      );
    if (
      stats.requests >= defaults.minimumRequestsForLatency &&
      stats.p95Ms !== null &&
      stats.p95Ms > p95Limit
    )
      return warn(`p95 времени ответа выше ${p95Limit} мс за ${stats.windowMinutes} мин.`, values);
    return ok('Ошибок и задержек выше порогов нет.', values);
  }

  private async daData(): Promise<OpsCheck> {
    const budget = await this.address.daDataBudget();
    const recent = this.metrics.recentStats().daData;
    const failures = recent.error + recent.timeout;
    const values = { ...budget, recent };
    if (!process.env.DADATA_API_KEY?.trim())
      return warn('Ключ DaData не задан: подсказки адреса отключены.', values);
    if (budget.used > budget.limit)
      return fail(`Суточный лимит DaData исчерпан (${budget.limit}).`, values);
    if (failures >= defaults.daDataFailures && failures > recent.success)
      return fail(`DaData не отвечает: ${failures} ошибок за последние минуты.`, values);
    if (budget.used >= Math.ceil(budget.limit * DADATA_BUDGET_WARNING_SHARE))
      return warn(`Израсходовано ${budget.used} из ${budget.limit} запросов DaData.`, values);
    return ok('DaData в пределах лимита.', values);
  }

  private async backup(): Promise<OpsCheck> {
    const heartbeat = await this.prisma.operationHeartbeat.findUnique({
      where: { name: 'backup' },
    });
    const maxAgeHours = setting('OPS_BACKUP_MAX_AGE_HOURS', defaults.backupMaxAgeHours);
    if (!heartbeat) return fail('Нет записи об успешном backup.');
    const ageHours = (Date.now() - heartbeat.succeededAt.getTime()) / 3_600_000;
    const values = {
      succeededAt: heartbeat.succeededAt.toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      details: heartbeat.details,
    };
    if (ageHours > maxAgeHours)
      return fail(
        `Последний успешный backup ${Math.floor(ageHours)} ч назад (порог ${maxAgeHours} ч).`,
        values,
      );
    return ok('Backup свежий.', values);
  }

  private async mediaCleanup(): Promise<OpsCheck> {
    const stuck = await this.prisma.storageCleanup.count({
      where: { attempts: { gte: defaults.stuckCleanupAttempts } },
    });
    if (stuck)
      return warn(`${stuck} файлов не удаётся удалить после нескольких попыток.`, { stuck });
    return ok('Очередь удаления файлов в норме.', { stuck });
  }
}

function ok(message: string, values: Record<string, unknown> = {}): OpsCheck {
  return { status: 'ok', message, ...values };
}
function warn(message: string, values: Record<string, unknown> = {}): OpsCheck {
  return { status: 'warn', message, ...values };
}
function fail(message: string, values: Record<string, unknown> = {}): OpsCheck {
  return { status: 'fail', message, ...values };
}

function setting(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
