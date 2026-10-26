import { CatalogImagesService } from './catalog-images.service';
import { StorageCleanupScheduler } from './storage-cleanup.scheduler';

describe('StorageCleanupScheduler', () => {
  const variables = [
    'STORAGE_CLEANUP_ENABLED',
    'MEDIA_RECONCILE_ENABLED',
    'MEDIA_RECONCILE_DRY_RUN',
    'MEDIA_RECONCILE_GRACE_HOURS',
  ] as const;
  const saved = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
  const report = {
    dryRun: true,
    orphaned: { publicBucket: 0, originals: 0 },
    unmanaged: { publicBucket: 0, originals: 0 },
    missing: { publicBucket: 0, originals: 0 },
    cleanup: { removed: 0, kept: 0, failed: 0 },
  };
  let images: { processStorageCleanup: jest.Mock; reconcileStorage: jest.Mock };
  let scheduler: StorageCleanupScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    for (const name of variables) delete process.env[name];
    images = {
      processStorageCleanup: jest.fn().mockResolvedValue({ removed: 0, kept: 0, failed: 0 }),
      reconcileStorage: jest.fn().mockResolvedValue(report),
    };
    scheduler = new StorageCleanupScheduler(images as unknown as CatalogImagesService);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
    for (const name of variables) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('retries queued deletions but never reconciles storage unless enabled', async () => {
    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);

    expect(images.processStorageCleanup).toHaveBeenCalled();
    expect(images.reconcileStorage).not.toHaveBeenCalled();
  });

  it('reconciles after the start delay with the configured mode and grace period', async () => {
    process.env.STORAGE_CLEANUP_ENABLED = 'false';
    process.env.MEDIA_RECONCILE_ENABLED = 'true';
    process.env.MEDIA_RECONCILE_DRY_RUN = 'true';
    process.env.MEDIA_RECONCILE_GRACE_HOURS = '48';
    scheduler.onModuleInit();

    await jest.advanceTimersByTimeAsync(9 * 60_000);
    expect(images.reconcileStorage).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(images.reconcileStorage).toHaveBeenCalledWith({
      dryRun: true,
      graceMs: 48 * 60 * 60_000,
    });
    expect(images.processStorageCleanup).not.toHaveBeenCalled();
  });
});
