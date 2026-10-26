import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StructuredLogger } from '../observability/structured-logger';
import { CatalogImagesService } from './catalog-images.service';

const defaultCleanupIntervalMinutes = 15;
const defaultReconcileIntervalHours = 24;
const defaultReconcileGraceHours = 24;
/** The first reconciliation waits for the deploy to settle instead of listing S3 on boot. */
const reconcileStartDelayMs = 10 * 60_000;

/**
 * S3-01: retries queued file deletions and periodically reconciles storage
 * with the database. The reconciler is opt-in (`MEDIA_RECONCILE_ENABLED`):
 * pointed at a bucket shared with another database it would see that
 * database's files as orphans.
 */
@Injectable()
export class StorageCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger();
  private readonly timers: NodeJS.Timeout[] = [];
  private cleaning = false;
  private reconciling = false;

  constructor(private readonly images: CatalogImagesService) {}

  onModuleInit() {
    if (process.env.STORAGE_CLEANUP_ENABLED?.trim().toLowerCase() !== 'false') {
      void this.runCleanup();
      this.every(
        positiveInteger(
          process.env.STORAGE_CLEANUP_INTERVAL_MINUTES,
          defaultCleanupIntervalMinutes,
        ) * 60_000,
        () => this.runCleanup(),
      );
    }
    if (enabled(process.env.MEDIA_RECONCILE_ENABLED)) {
      const start = setTimeout(() => void this.runReconcile(), reconcileStartDelayMs);
      start.unref();
      this.timers.push(start);
      this.every(
        positiveInteger(process.env.MEDIA_RECONCILE_INTERVAL_HOURS, defaultReconcileIntervalHours) *
          60 *
          60_000,
        () => this.runReconcile(),
      );
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async runCleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const report = await this.images.processStorageCleanup();
      if (report.removed || report.kept || report.failed)
        this.logger.event(
          report.failed ? 'warn' : 'info',
          'media.storage_cleanup_completed',
          report,
        );
    } catch (error) {
      this.logger.error(error, undefined, StorageCleanupScheduler.name);
    } finally {
      this.cleaning = false;
    }
  }

  async runReconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const report = await this.images.reconcileStorage({
        dryRun: enabled(process.env.MEDIA_RECONCILE_DRY_RUN),
        graceMs:
          positiveInteger(process.env.MEDIA_RECONCILE_GRACE_HOURS, defaultReconcileGraceHours) *
          60 *
          60_000,
      });
      const problems =
        report.missing.publicBucket + report.missing.originals + report.cleanup.failed;
      this.logger.event(problems ? 'warn' : 'info', 'media.storage_reconciled', report);
    } catch (error) {
      this.logger.error(error, undefined, StorageCleanupScheduler.name);
    } finally {
      this.reconciling = false;
    }
  }

  private every(intervalMs: number, task: () => Promise<void>) {
    const timer = setInterval(() => void task(), intervalMs);
    timer.unref();
    this.timers.push(timer);
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}
