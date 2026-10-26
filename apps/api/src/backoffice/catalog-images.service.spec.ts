import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATALOG_IMAGE_MAX_FILE_SIZE_BYTES,
  CATALOG_IMAGE_MAX_OUTPUT_DIMENSION,
  CatalogImagesService,
} from './catalog-images.service';

const UNIQUE_WEBP_KEY = /^catalog\/product-1\/[0-9a-f-]{36}\.webp$/;

type QueueRow = {
  id: string;
  location: string;
  key: string;
  reason: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
};
type QueueFilter = { location: string; key: string };

/** In-memory `StorageCleanup` table for the calls made by the image service. */
function createCleanupQueue() {
  const rows: QueueRow[] = [];
  let sequence = 0;
  const storageCleanup = {
    createMany: jest.fn(({ data }: { data: Array<QueueFilter & { reason: string }> }) => {
      for (const item of data) {
        if (rows.some((row) => row.location === item.location && row.key === item.key)) continue;
        sequence += 1;
        rows.push({
          id: `cleanup-${sequence}`,
          attempts: 0,
          lastError: null,
          nextAttemptAt: new Date(0),
          ...item,
        });
      }
      return Promise.resolve({ count: data.length });
    }),
    findMany: jest.fn(
      ({ where }: { where?: { OR?: QueueFilter[]; nextAttemptAt?: { lte: Date } } } = {}) =>
        Promise.resolve(
          rows
            .filter((row) =>
              where?.OR
                ? where.OR.some((item) => item.location === row.location && item.key === row.key)
                : !where?.nextAttemptAt || row.nextAttemptAt <= where.nextAttemptAt.lte,
            )
            .map((row) => ({ ...row })),
        ),
    ),
    deleteMany: jest.fn(({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((row) => row.id === where.id);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve({ count: index >= 0 ? 1 : 0 });
    }),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { lastError: string; nextAttemptAt: Date };
      }) => {
        const row = rows.find((item) => item.id === where.id);
        if (row) Object.assign(row, data, { attempts: row.attempts + 1 });
        return Promise.resolve({ count: row ? 1 : 0 });
      },
    ),
    count: jest.fn(({ where }: { where: QueueFilter }) =>
      Promise.resolve(
        rows.filter((row) => row.location === where.location && row.key === where.key).length,
      ),
    ),
  };
  return { rows, storageCleanup };
}

describe('CatalogImagesService', () => {
  const product = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const sentCommands: Array<PutObjectCommand | DeleteObjectCommand> = [];
  const sentOptions: Array<{ abortSignal?: AbortSignal } | undefined> = [];
  const recordCommand = (
    command: PutObjectCommand | DeleteObjectCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<object> => {
    sentCommands.push(command);
    sentOptions.push(options);
    return Promise.resolve({});
  };
  const send = jest.fn(recordCommand);
  const publicUrl = 'https://cdn.example/catalog';
  let service: CatalogImagesService;
  let widePng: Buffer;
  let queue: ReturnType<typeof createCleanupQueue>;
  const siteMedia = { count: jest.fn(), findMany: jest.fn() };
  let originalsDirectory: string;
  let previousOriginalsDirectory: string | undefined;

  beforeAll(async () => {
    widePng = await sharp({
      create: {
        width: 3_000,
        height: 20,
        channels: 4,
        background: { r: 120, g: 30, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    previousOriginalsDirectory = process.env.MEDIA_ORIGINALS_DIR;
    originalsDirectory = await mkdtemp(join(tmpdir(), 'catalog-originals-'));
    process.env.MEDIA_ORIGINALS_DIR = originalsDirectory;
    sentCommands.length = 0;
    sentOptions.length = 0;
    send.mockImplementation(recordCommand);
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: null,
      imageOriginalKey: null,
    });
    product.updateMany.mockResolvedValue({ count: 1 });
    product.count.mockResolvedValue(0);
    siteMedia.count.mockResolvedValue(0);
    siteMedia.findMany.mockResolvedValue([]);
    queue = createCleanupQueue();
    const { storageCleanup } = queue;
    const prisma = {
      product,
      siteMedia,
      storageCleanup,
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ product, storageCleanup }),
    };
    service = new CatalogImagesService(prisma as unknown as PrismaService);
    Object.defineProperty(service, 'storage', {
      value: () => ({
        bucket: 'catalog',
        publicUrl,
        client: { send },
      }),
    });
    Object.defineProperties(service, {
      storeOriginal: { value: jest.fn().mockResolvedValue(undefined) },
      removeBackground: { value: jest.fn().mockResolvedValue(widePng) },
      deleteOriginalAfterFailure: { value: jest.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(async () => {
    if (previousOriginalsDirectory === undefined) delete process.env.MEDIA_ORIGINALS_DIR;
    else process.env.MEDIA_ORIGINALS_DIR = previousOriginalsDirectory;
    await rm(originalsDirectory, { recursive: true, force: true });
  });

  it('stores a transparent WebP under a unique per-product key cropped to its content', async () => {
    const result = await service.uploadMain('product-1', imageFile(widePng, 'application/pdf'));

    expect(result.imageKey).toMatch(UNIQUE_WEBP_KEY);
    expect(result.imagePath).toMatch(
      /^https:\/\/cdn\.example\/catalog\/catalog\/product-1\/[0-9a-f-]{36}\.webp$/,
    );
    const put = putCommand(sentCommands[0]);
    expect(put.input.ContentType).toBe('image/webp');
    expect(put.input.Key).toBe(result.imageKey);
    expect(put.input.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(sentOptions[0]?.abortSignal).toBeInstanceOf(AbortSignal);
    const output = Buffer.from(put.input.Body as Uint8Array);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(CATALOG_IMAGE_MAX_OUTPUT_DIMENSION);
    expect(metadata.height).toBeGreaterThan(16);
    expect(product.updateMany).toHaveBeenCalledTimes(1);
    const storedOriginal = storedOriginalKeys()[0];
    expect(storedOriginal).toMatch(/^catalog\/product-1\/[0-9a-f-]{36}\.png$/);
    expect(product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product-1', imageKey: null, imageOriginalKey: null },
      data: { imageKey: result.imageKey, imageOriginalKey: storedOriginal },
    });
  });

  it('keeps transparency and removes empty transparent margins', async () => {
    const cylinder = await sharp(
      Buffer.from(
        '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="40" width="60" height="20" rx="8" fill="#781e28"/></svg>',
      ),
    )
      .png()
      .toBuffer();

    const output = await (
      service as unknown as { toCatalogWebp(buffer: Buffer): Promise<Buffer> }
    ).toCatalogWebp(cylinder);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(76);
    expect(metadata.height).toBe(36);
    expect(metadata.hasAlpha).toBe(true);
  });

  it('writes every version to a new key that does not depend on the SKU', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: 'catalog/100001.webp',
      imageOriginalKey: 'catalog/100001.png',
    });

    const first = await service.uploadMain('product-1', imageFile(widePng, 'image/png'));
    const second = await service.uploadMain('product-1', imageFile(widePng, 'image/png'));

    expect(first.imageKey).toMatch(UNIQUE_WEBP_KEY);
    expect(second.imageKey).toMatch(UNIQUE_WEBP_KEY);
    expect(first.imageKey).not.toBe(second.imageKey);
    expect(first.imageKey).not.toContain('100001');
    const [firstOriginal, secondOriginal] = storedOriginalKeys();
    expect(firstOriginal).not.toBe('catalog/100001.png');
    expect(firstOriginal).not.toBe(secondOriginal);
  });

  it('keeps the published image and original when the background worker is down', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: 'catalog/100001.webp',
      imageOriginalKey: 'catalog/100001.png',
    });
    const unavailable = new ServiceUnavailableException('worker down');
    internals().removeBackground.mockRejectedValue(unavailable);

    await expect(service.uploadMain('product-1', imageFile(widePng, 'image/png'))).rejects.toBe(
      unavailable,
    );

    expect(deletedKeys()).not.toContain('catalog/100001.webp');
    expect(sentCommands.some((command) => command instanceof PutObjectCommand)).toBe(false);
    expect(product.updateMany).not.toHaveBeenCalled();
    const storedOriginal = storedOriginalKeys()[0];
    expect(internals().deleteOriginalAfterFailure.mock.calls).toEqual([
      [storedOriginal, 'new original rollback'],
    ]);
  });

  it('rejects a file whose declared image MIME hides non-image content', async () => {
    await expect(
      service.uploadMain('product-1', imageFile(Buffer.from('not an image'), 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
    expect(product.updateMany).not.toHaveBeenCalled();
  });

  it('rejects corrupted content even when its magic bytes look valid', async () => {
    const corruptedPng = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from('corrupted'),
    ]);
    await expect(
      service.uploadMain('product-1', imageFile(corruptedPng, 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects files larger than the multipart limit before touching the database', async () => {
    const oversized = Buffer.alloc(CATALOG_IMAGE_MAX_FILE_SIZE_BYTES + 1);
    await expect(
      service.uploadMain('product-1', imageFile(oversized, 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(product.findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an image with an excessive dimension', async () => {
    const tooWide = await sharp({
      create: {
        width: 8_001,
        height: 1,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    await expect(
      service.uploadMain('product-1', imageFile(tooWide, 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not upload anything for a missing product', async () => {
    product.findUnique.mockResolvedValue(null);
    await expect(
      service.uploadMain('missing', imageFile(widePng, 'image/png')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes only the newly uploaded object when the database update fails', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: 'catalog/100001.webp',
      imageOriginalKey: 'catalog/100001.png',
    });
    const databaseError = new Error('database unavailable');
    product.updateMany.mockRejectedValue(databaseError);

    await expect(service.uploadMain('product-1', imageFile(widePng, 'image/png'))).rejects.toBe(
      databaseError,
    );

    expect(send).toHaveBeenCalledTimes(2);
    const put = putCommand(sentCommands[0]);
    const rollback = deleteCommand(sentCommands[1]);
    expect(rollback.input).toEqual({ Bucket: 'catalog', Key: put.input.Key });
    expect(put.input.Key).not.toBe('catalog/100001.webp');
    const storedOriginal = storedOriginalKeys()[0];
    expect(internals().deleteOriginalAfterFailure.mock.calls).toEqual([
      [storedOriginal, 'new original rollback'],
    ]);
  });

  it('rolls the new image back when the audit record in the same transaction fails', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: 'catalog/product-1/current.webp',
      imageOriginalKey: 'catalog/product-1/current.png',
    });
    const auditFailure = new Error('audit table unavailable');

    await expect(
      service.uploadMain('product-1', imageFile(widePng, 'image/png'), () =>
        Promise.reject(auditFailure),
      ),
    ).rejects.toBe(auditFailure);

    expect(product.updateMany).toHaveBeenCalledTimes(1);
    const put = putCommand(sentCommands[0]);
    expect(deletedKeys()).toEqual([put.input.Key]);
    expect(deletedKeys()).not.toContain('catalog/product-1/current.webp');
  });

  it('keeps the concurrent winner and cleans up only its own object on conflict', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: 'catalog/product-1/current.webp',
      imageOriginalKey: 'catalog/product-1/current.png',
    });
    product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.uploadMain('product-1', imageFile(widePng, 'image/png')),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'product-1',
          imageKey: 'catalog/product-1/current.webp',
          imageOriginalKey: 'catalog/product-1/current.png',
        },
      }),
    );
    expect(send).toHaveBeenCalledTimes(2);
    const put = putCommand(sentCommands[0]);
    expect(deletedKeys()).toEqual([put.input.Key]);
    expect(internals().deleteOriginalAfterFailure).not.toHaveBeenCalledWith(
      'catalog/product-1/current.png',
      expect.anything(),
    );
  });

  it('queues the previous files in the commit and deletes them only afterwards', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: '100001',
      imageKey: 'catalog/product-1/old.webp',
      imageOriginalKey: 'catalog/product-1/old.png',
    });
    await writeOriginal('catalog/product-1/old.png');
    let committed = false;
    product.updateMany.mockImplementation(() => {
      committed = true;
      return Promise.resolve({ count: 1 });
    });
    send.mockImplementation((command, options) => {
      if (command instanceof DeleteObjectCommand) expect(committed).toBe(true);
      sentCommands.push(command);
      sentOptions.push(options);
      return Promise.resolve({});
    });

    await service.uploadMain('product-1', imageFile(widePng, 'image/png'));

    expect(queue.storageCleanup.createMany).toHaveBeenCalledWith({
      data: [
        {
          location: 'PUBLIC_BUCKET',
          key: 'catalog/product-1/old.webp',
          reason: 'replaced product image',
        },
        {
          location: 'ORIGINALS',
          key: 'catalog/product-1/old.png',
          reason: 'replaced product image',
        },
      ],
      skipDuplicates: true,
    });
    expect(deletedKeys()).toEqual(['catalog/product-1/old.webp']);
    await expect(originalPresent('catalog/product-1/old.png')).resolves.toBe(false);
    expect(queue.rows).toEqual([]);
  });

  it('does not delete a legacy SKU key that another product still references', async () => {
    product.findUnique.mockResolvedValue({
      id: 'product-1',
      sku: 'B',
      imageKey: 'catalog/A.webp',
      imageOriginalKey: 'catalog/A.png',
    });
    await writeOriginal('catalog/A.png');
    product.count.mockResolvedValue(1);

    await service.uploadMain('product-1', imageFile(widePng, 'image/png'));

    expect(deletedKeys()).toEqual([]);
    await expect(originalPresent('catalog/A.png')).resolves.toBe(true);
    expect(queue.rows).toEqual([]);
  });

  describe('storage cleanup queue', () => {
    it('removes queued files of deleted products and empties their directory', async () => {
      await writeOriginal('catalog/product-1/0f8b7c1e-5a4d-4c3b-9a2e-1d0c9b8a7f6e.png');
      await queueFiles(
        ['PUBLIC_BUCKET', 'catalog/product-1/0f8b7c1e-5a4d-4c3b-9a2e-1d0c9b8a7f6e.webp'],
        ['ORIGINALS', 'catalog/product-1/0f8b7c1e-5a4d-4c3b-9a2e-1d0c9b8a7f6e.png'],
      );

      await expect(service.processStorageCleanup()).resolves.toEqual({
        removed: 2,
        kept: 0,
        failed: 0,
      });
      expect(deletedKeys()).toEqual([
        'catalog/product-1/0f8b7c1e-5a4d-4c3b-9a2e-1d0c9b8a7f6e.webp',
      ]);
      await expect(originalPresent('catalog/product-1')).resolves.toBe(false);
      expect(queue.rows).toEqual([]);
    });

    it('keeps files that a record uses again and never deletes outside managed prefixes', async () => {
      siteMedia.count.mockImplementation(({ where }: { where: Record<string, string> }) =>
        Promise.resolve(where.imageKey === 'site/hero/shared.webp' ? 1 : 0),
      );
      await queueFiles(
        ['PUBLIC_BUCKET', 'site/hero/shared.webp'],
        ['PUBLIC_BUCKET', 'other/x.webp'],
      );

      await expect(service.processStorageCleanup()).resolves.toEqual({
        removed: 1,
        kept: 1,
        failed: 0,
      });
      expect(deletedKeys()).toEqual([]);
      expect(queue.rows).toEqual([]);
    });

    it('keeps a failed deletion queued with a growing delay instead of failing the caller', async () => {
      send.mockRejectedValue(new Error('S3 unavailable'));
      await queueFiles(['PUBLIC_BUCKET', 'catalog/product-1/a.webp']);

      await expect(
        service.cleanUpAfterCommit([
          { location: 'PUBLIC_BUCKET', key: 'catalog/product-1/a.webp' },
        ]),
      ).resolves.toBeUndefined();
      await service.processStorageCleanup([
        { location: 'PUBLIC_BUCKET', key: 'catalog/product-1/a.webp' },
      ]);

      expect(queue.rows).toEqual([
        expect.objectContaining({ attempts: 2, lastError: 'S3 unavailable' }),
      ]);
      expect(queue.rows[0]?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 90_000);
      // Not due yet, so the periodic run leaves it alone.
      await expect(service.processStorageCleanup()).resolves.toEqual({
        removed: 0,
        kept: 0,
        failed: 0,
      });
    });
  });

  describe('storage reconciliation', () => {
    const day = 24 * 60 * 60_000;
    const oldUuid = '11111111-2222-4333-8444-555555555555';
    const newUuid = '66666666-7777-4888-9999-aaaaaaaaaaaa';
    const liveUuid = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

    beforeEach(async () => {
      const old = new Date(Date.now() - 3 * day);
      const listing: Record<string, Array<{ Key: string; LastModified: Date }>> = {
        'catalog/': [
          { Key: `catalog/p-1/${oldUuid}.webp`, LastModified: old },
          { Key: `catalog/p-1/${newUuid}.webp`, LastModified: new Date() },
          { Key: `catalog/p-2/${liveUuid}.webp`, LastModified: old },
          { Key: 'catalog/100001.webp', LastModified: old },
        ],
        'products/': [],
        'site/': [{ Key: `site/gallery/${oldUuid}.webp`, LastModified: old }],
      };
      send.mockImplementation((command: PutObjectCommand | DeleteObjectCommand) => {
        sentCommands.push(command);
        if (command instanceof ListObjectsV2Command)
          return Promise.resolve({ Contents: listing[command.input.Prefix ?? ''] ?? [] });
        return Promise.resolve({});
      });
      await writeOriginal(`catalog/p-1/${oldUuid}.png`, old);
      await writeOriginal(`catalog/p-1/${oldUuid}.png.${newUuid}.part`, old);
      await writeOriginal('catalog/100001.png', old);
      product.findMany.mockResolvedValue([
        {
          imageKey: `catalog/p-2/${liveUuid}.webp`,
          imageOriginalKey: `catalog/p-2/${liveUuid}.png`,
        },
      ]);
    });

    it('deletes only old unreferenced generated files and reports the rest', async () => {
      const report = await service.reconcileStorage({ dryRun: false, graceMs: day });

      expect(report).toEqual({
        dryRun: false,
        orphaned: { publicBucket: 2, originals: 2 },
        unmanaged: { publicBucket: 1, originals: 1 },
        missing: { publicBucket: 0, originals: 1 },
        cleanup: { removed: 4, kept: 0, failed: 0 },
      });
      expect(deletedKeys().sort()).toEqual(
        [`catalog/p-1/${oldUuid}.webp`, `site/gallery/${oldUuid}.webp`].sort(),
      );
      await expect(originalPresent(`catalog/p-1/${oldUuid}.png`)).resolves.toBe(false);
      await expect(originalPresent('catalog/100001.png')).resolves.toBe(true);
    });

    it('only reports in dry-run mode', async () => {
      const report = await service.reconcileStorage({ dryRun: true, graceMs: day });

      expect(report.orphaned).toEqual({ publicBucket: 2, originals: 2 });
      expect(deletedKeys()).toEqual([]);
      expect(queue.rows).toEqual([]);
      await expect(originalPresent(`catalog/p-1/${oldUuid}.png`)).resolves.toBe(true);
    });
  });

  it('saves the previewed image without running background removal again', async () => {
    const previewed = await service.preview(imageFile(widePng, 'image/png'));
    const result = await service.uploadMain('product-1', imageFile(widePng, 'image/png'));

    expect(internals().removeBackground).toHaveBeenCalledTimes(1);
    const put = putCommand(sentCommands[0]);
    expect(Buffer.from(put.input.Body as Uint8Array).equals(previewed)).toBe(true);
    expect(result.imageKey).toMatch(UNIQUE_WEBP_KEY);
  });

  it('processes a file again when it differs from the preview or the preview expired', async () => {
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      await service.preview(imageFile(widePng, 'image/png'));
      const otherPng = await sharp(widePng).negate({ alpha: false }).png().toBuffer();
      await service.uploadMain('product-1', imageFile(otherPng, 'image/png'));
      expect(internals().removeBackground).toHaveBeenCalledTimes(2);

      now.mockReturnValue(1_000_000 + 31 * 60_000);
      await service.uploadMain('product-1', imageFile(widePng, 'image/png'));
      expect(internals().removeBackground).toHaveBeenCalledTimes(3);
    } finally {
      now.mockRestore();
    }
  });

  describe('catalog originals import', () => {
    beforeEach(() => {
      Object.defineProperty(service, 'originalExists', {
        value: jest.fn().mockResolvedValue(false),
      });
      product.findMany.mockResolvedValue([
        { id: 'upper', sku: 'ABC', imageOriginalKey: null },
        { id: 'lower', sku: 'abc', imageOriginalKey: null },
        { id: 'numeric', sku: '100001', imageOriginalKey: null },
        { id: 'spaced-1', sku: 'X-1', imageOriginalKey: null },
        { id: 'spaced-2', sku: 'X-1 ', imageOriginalKey: null },
      ]);
    });

    it('matches file names to SKUs case-sensitively and stores under unique keys', async () => {
      const result = await service.importCatalogImageOriginals([
        imageFile(widePng, 'image/png', 'abc.png'),
        imageFile(widePng, 'image/png', 'ABC.png'),
      ]);

      expect(result).toMatchObject({ imported: 2, ambiguous: [], notMatched: [] });
      const updates = (
        product.updateMany.mock.calls as Array<
          [{ where: { id: string }; data: { imageOriginalKey: string } }]
        >
      ).map(([update]) => update);
      expect(updates.map((update) => update.where.id)).toEqual(['lower', 'upper']);
      expect(updates[0]?.data.imageOriginalKey).toMatch(/^catalog\/lower\/[0-9a-f-]{36}\.png$/);
      expect(updates[1]?.data.imageOriginalKey).toMatch(/^catalog\/upper\/[0-9a-f-]{36}\.png$/);
    });

    it('reports a name that matches SKUs only when ignoring case as ambiguous', async () => {
      const result = await service.importCatalogImageOriginals([
        imageFile(widePng, 'image/png', 'Abc.png'),
        imageFile(widePng, 'image/png', 'missing.png'),
        imageFile(widePng, 'image/png', 'X-1.png'),
      ]);

      expect(result).toMatchObject({
        imported: 0,
        ambiguous: ['Abc.png', 'X-1.png'],
        notMatched: ['missing.png'],
      });
      expect(internals().storeOriginal).not.toHaveBeenCalled();
      expect(product.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('catalog originals synchronization', () => {
    let originalsDirectory: string;
    let previousOriginalsDirectory: string | undefined;

    beforeEach(async () => {
      previousOriginalsDirectory = process.env.MEDIA_ORIGINALS_DIR;
      originalsDirectory = await mkdtemp(join(tmpdir(), 'catalog-originals-'));
      process.env.MEDIA_ORIGINALS_DIR = originalsDirectory;
      await mkdir(join(originalsDirectory, 'catalog', 'kept'), { recursive: true });
      await Promise.all(
        ['catalog/ABC.jpg', 'catalog/abc.png', 'catalog/KEPT.jpg', 'catalog/kept/current.png'].map(
          (key) => writeFile(join(originalsDirectory, key), 'original'),
        ),
      );
      Object.defineProperty(service, 'prisma', {
        value: {
          product,
          siteMedia: { findMany: jest.fn().mockResolvedValue([]) },
          storageCleanup: queue.storageCleanup,
        },
      });
      product.findMany.mockResolvedValue([
        { id: 'upper', sku: 'ABC', imageOriginalKey: null },
        { id: 'lower', sku: 'abc', imageOriginalKey: null },
        { id: 'mixed', sku: 'Abc', imageOriginalKey: null },
        { id: 'kept', sku: 'KEPT', imageOriginalKey: 'catalog/kept/current.png' },
      ]);
    });

    afterEach(async () => {
      if (previousOriginalsDirectory === undefined) delete process.env.MEDIA_ORIGINALS_DIR;
      else process.env.MEDIA_ORIGINALS_DIR = previousOriginalsDirectory;
      await rm(originalsDirectory, { recursive: true, force: true });
    });

    it('links SKU-named files case-sensitively and never replaces an existing original', async () => {
      const result = await service.synchronizeOriginalsFromStorage();

      expect(result).toEqual({ linked: 2, alreadyLinked: 1, ambiguous: [] });
      expect((product.updateMany.mock.calls as Array<[unknown]>).map(([update]) => update)).toEqual(
        [
          {
            where: { id: 'upper', imageOriginalKey: null },
            data: { imageOriginalKey: 'catalog/ABC.jpg' },
          },
          {
            where: { id: 'lower', imageOriginalKey: null },
            data: { imageOriginalKey: 'catalog/abc.png' },
          },
        ],
      );
    });

    it('does not link a file that is queued for deletion', async () => {
      await queue.storageCleanup.createMany({
        data: [{ location: 'ORIGINALS', key: 'catalog/ABC.jpg', reason: 'product deletion' }],
      });

      const result = await service.synchronizeOriginalsFromStorage();

      expect(result.linked).toBe(1);
      expect(
        (product.updateMany.mock.calls as Array<[{ where: { id: string } }]>).map(
          ([update]) => update.where.id,
        ),
      ).toEqual(['lower']);
    });
  });

  async function writeOriginal(key: string, modifiedAt?: Date) {
    const path = join(originalsDirectory, key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'original');
    if (modifiedAt) await utimes(path, modifiedAt, modifiedAt);
  }

  function originalPresent(key: string) {
    return access(join(originalsDirectory, key)).then(
      () => true,
      () => false,
    );
  }

  function queueFiles(...files: Array<['PUBLIC_BUCKET' | 'ORIGINALS', string]>) {
    return queue.storageCleanup.createMany({
      data: files.map(([location, key]) => ({ location, key, reason: 'test' })),
    });
  }

  function internals() {
    return service as unknown as {
      storeOriginal: jest.Mock;
      removeBackground: jest.Mock;
      deleteOriginalAfterFailure: jest.Mock;
    };
  }

  function storedOriginalKeys() {
    return (internals().storeOriginal.mock.calls as Array<[string, Buffer]>).map(([key]) => key);
  }

  function deletedKeys() {
    return sentCommands
      .filter((command): command is DeleteObjectCommand => command instanceof DeleteObjectCommand)
      .map((command) => command.input.Key);
  }
});

describe('CatalogImagesService storage lifecycle', () => {
  it('reuses one S3 client for the lifetime of the service', () => {
    const previousEnvironment = {
      S3_BUCKET: process.env.S3_BUCKET,
      S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
      S3_REGION: process.env.S3_REGION,
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    };
    Object.assign(process.env, {
      S3_BUCKET: 'catalog',
      S3_PUBLIC_URL: 'https://cdn.example/catalog',
      S3_REGION: 'ru-central1',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
    });
    const service = new CatalogImagesService({} as PrismaService);
    const internals = service as unknown as {
      storage(): { client: { destroy(): void } };
    };

    try {
      const first = internals.storage();
      const second = internals.storage();

      expect(second).toBe(first);
      expect(second.client).toBe(first.client);
    } finally {
      service.onModuleDestroy();
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

function imageFile(
  buffer: Buffer,
  mimetype: string,
  originalname = 'upload.bin',
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
    stream: Readable.from(buffer),
    destination: '',
    filename: '',
    path: '',
  };
}

function putCommand(command: PutObjectCommand | DeleteObjectCommand): PutObjectCommand {
  expect(command).toBeInstanceOf(PutObjectCommand);
  if (!(command instanceof PutObjectCommand)) throw new Error('Expected PutObjectCommand.');
  return command;
}

function deleteCommand(command: PutObjectCommand | DeleteObjectCommand): DeleteObjectCommand {
  expect(command).toBeInstanceOf(DeleteObjectCommand);
  if (!(command instanceof DeleteObjectCommand)) throw new Error('Expected DeleteObjectCommand.');
  return command;
}
