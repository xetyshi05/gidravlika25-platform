import { ConflictException } from '@nestjs/common';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogImagesService } from './catalog-images.service';

type Kind = 'HERO' | 'GALLERY' | 'MAIN_GALLERY';
type Row = {
  id: string;
  kind: Kind;
  imageKey: string;
  originalKey: string | null;
  alt: string;
  title: string | null;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
type Where = Partial<Record<keyof Row, unknown>> & { id?: unknown };

/** Minimal in-memory stand-in for the Prisma calls used by the site media code. */
function createSiteMediaDatabase() {
  const rows: Row[] = [];
  let sequence = 0;
  const matches = (row: Row, where: Where = {}) =>
    Object.entries(where).every(([field, condition]) => {
      const value = row[field as keyof Row];
      if (condition && typeof condition === 'object' && 'not' in condition)
        return value !== condition.not;
      if (condition && typeof condition === 'object' && 'in' in condition)
        return (condition as { in: unknown[] }).in.includes(value);
      return value === condition;
    });
  // Prisma returns fresh objects, so later updates must not leak into earlier reads.
  const copy = (row: Row | undefined) => (row ? { ...row } : null);
  const sorted = (items: Row[]) =>
    [...items].sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position);
  const assertUniqueKey = (imageKey: string, id?: string) => {
    if (rows.some((row) => row.imageKey === imageKey && row.id !== id))
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  };
  const siteMedia = {
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(copy(rows.find((row) => row.id === where.id))),
    ),
    findFirst: jest.fn(({ where }: { where?: Where } = {}) =>
      Promise.resolve(copy(sorted(rows.filter((row) => matches(row, where)))[0])),
    ),
    findMany: jest.fn(({ where }: { where?: Where } = {}) =>
      Promise.resolve(sorted(rows.filter((row) => matches(row, where))).map((row) => ({ ...row }))),
    ),
    count: jest.fn(({ where }: { where?: Where } = {}) =>
      Promise.resolve(rows.filter((row) => matches(row, where)).length),
    ),
    aggregate: jest.fn(({ where }: { where?: Where }) => {
      const positions = rows.filter((row) => matches(row, where)).map((row) => row.position);
      return Promise.resolve({
        _max: { position: positions.length ? Math.max(...positions) : null },
      });
    }),
    create: jest.fn(({ data }: { data: Partial<Row> & { kind: Kind; imageKey: string } }) => {
      assertUniqueKey(data.imageKey);
      sequence += 1;
      const row: Row = {
        id: `media-${sequence}`,
        originalKey: null,
        alt: '',
        title: null,
        position: 0,
        isActive: true,
        createdAt: new Date(sequence),
        updatedAt: new Date(sequence),
        ...data,
      };
      rows.push(row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      if (data.imageKey) assertUniqueKey(data.imageKey, row.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve({ ...row });
    }),
    updateMany: jest.fn(({ where, data }: { where: Where; data: Partial<Row> }) => {
      const matched = rows.filter((row) => matches(row, where));
      for (const row of matched) {
        if (data.imageKey) assertUniqueKey(data.imageKey, row.id);
        Object.assign(row, data, { updatedAt: new Date() });
      }
      return Promise.resolve({ count: matched.length });
    }),
    delete: jest.fn(({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((row) => row.id === where.id);
      const [row] = rows.splice(index, 1);
      return Promise.resolve(row);
    }),
    deleteMany: jest.fn(({ where }: { where?: Where } = {}) => {
      const remaining = rows.filter((row) => !matches(row, where));
      const count = rows.length - remaining.length;
      rows.splice(0, rows.length, ...remaining);
      return Promise.resolve({ count });
    }),
  };
  const client = {
    siteMedia,
    product: { findMany: jest.fn().mockResolvedValue([]) },
    storageCleanup: { count: jest.fn().mockResolvedValue(0) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback(client),
  );
  return { client, rows };
}

describe('CatalogImagesService site media', () => {
  let database: ReturnType<typeof createSiteMediaDatabase>;
  let objects: Set<string>;
  let commands: Array<PutObjectCommand | DeleteObjectCommand | ListObjectsV2Command>;
  let service: CatalogImagesService;
  let png: Buffer;

  beforeAll(async () => {
    png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    delete process.env.S3_PUBLIC_URL;
    process.env.S3_PUBLIC_URL = 'https://cdn.example/site';
    database = createSiteMediaDatabase();
    objects = new Set();
    commands = [];
    const send = jest.fn(
      (command: PutObjectCommand | DeleteObjectCommand | ListObjectsV2Command) => {
        commands.push(command);
        if (command instanceof PutObjectCommand) objects.add(command.input.Key!);
        if (command instanceof DeleteObjectCommand) objects.delete(command.input.Key!);
        if (command instanceof ListObjectsV2Command) {
          const prefix = command.input.Prefix ?? '';
          return Promise.resolve({
            Contents: [...objects].filter((key) => key.startsWith(prefix)).map((Key) => ({ Key })),
          });
        }
        return Promise.resolve({});
      },
    );
    service = new CatalogImagesService(database.client as unknown as PrismaService);
    Object.defineProperties(service, {
      storage: {
        configurable: true,
        value: () => ({ bucket: 'site', publicUrl: 'https://cdn.example/site', client: { send } }),
      },
      storeOriginal: { value: jest.fn().mockResolvedValue(undefined) },
      deleteOriginalAfterFailure: { value: jest.fn().mockResolvedValue(undefined) },
      originalExists: { value: jest.fn().mockResolvedValue(false) },
      toSiteWebp: { value: jest.fn().mockResolvedValue(Buffer.from('webp')) },
      siteMediaSourceBuffer: { value: jest.fn().mockResolvedValue(png) },
    });
  });

  afterAll(() => {
    delete process.env.S3_PUBLIC_URL;
  });

  const upload = (kind: Kind, alt: string) =>
    service.uploadSiteMedia(imageFile(png), { kind, alt });
  const galleryKeys = () =>
    database.rows
      .filter((row) => row.kind === 'GALLERY')
      .sort((a, b) => a.position - b.position)
      .map((row) => ({ alt: row.alt, imageKey: row.imageKey, position: row.position }));
  const deletedKeys = () =>
    commands
      .filter((command): command is DeleteObjectCommand => command instanceof DeleteObjectCommand)
      .map((command) => command.input.Key);

  it('keeps every photo after delete → reorder → upload', async () => {
    const a = await upload('GALLERY', 'A');
    const b = await upload('GALLERY', 'B');
    const c = await upload('GALLERY', 'C');

    await service.deleteSiteMedia(a.id);
    await service.updateSiteMedia(c.id, { position: 0 });
    const d = await upload('GALLERY', 'D');

    expect(galleryKeys().map(({ alt, position }) => [alt, position])).toEqual([
      ['C', 0],
      ['B', 1],
      ['D', 2],
    ]);
    const keys = galleryKeys().map((row) => row.imageKey);
    expect(new Set(keys).size).toBe(3);
    for (const key of keys) expect(objects.has(key)).toBe(true);
    expect(deletedKeys()).toEqual([a.imageKey]);
    for (const media of [b, c, d])
      expect(media.imageKey).toMatch(/^site\/gallery\/[0-9a-f-]{36}\.webp$/);
  });

  it('replaces a photo after a reorder without touching its neighbours', async () => {
    const a = await upload('GALLERY', 'A');
    const b = await upload('GALLERY', 'B');
    await service.updateSiteMedia(b.id, { position: 0 });

    const replaced = await service.replaceSiteMedia(a.id, imageFile(png));

    expect(replaced.imageKey).not.toBe(a.imageKey);
    expect(objects.has(b.imageKey)).toBe(true);
    expect(objects.has(replaced.imageKey)).toBe(true);
    expect(deletedKeys()).toEqual([a.imageKey]);
  });

  it('keeps the current photo when a replacement fails in the database', async () => {
    const a = await upload('GALLERY', 'A');
    database.client.siteMedia.updateMany.mockRejectedValueOnce(new Error('database down'));

    await expect(service.replaceSiteMedia(a.id, imageFile(png))).rejects.toThrow('database down');

    expect(objects.has(a.imageKey)).toBe(true);
    expect(database.rows[0]?.imageKey).toBe(a.imageKey);
    expect(deletedKeys()).toHaveLength(1);
    expect(deletedKeys()[0]).not.toBe(a.imageKey);
  });

  it('rejects a replacement that lost a race and keeps the winner', async () => {
    const a = await upload('GALLERY', 'A');
    database.client.siteMedia.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.replaceSiteMedia(a.id, imageFile(png))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(objects.has(a.imageKey)).toBe(true);
  });

  it('writes a cropped version to a new key and removes the old one after commit', async () => {
    const a = await upload('GALLERY', 'A');

    const cropped = await service.cropSiteMedia(a.id, { x: 0, y: 0, width: 0.5, height: 0.5 });

    expect(cropped.imageKey).not.toBe(a.imageKey);
    expect(objects.has(cropped.imageKey)).toBe(true);
    expect(deletedKeys()).toEqual([a.imageKey]);
  });

  it('reorders positions inside one locked transaction', async () => {
    const a = await upload('GALLERY', 'A');
    await upload('GALLERY', 'B');
    const c = await upload('GALLERY', 'C');
    database.client.$transaction.mockClear();
    database.client.$executeRaw.mockClear();

    await service.updateSiteMedia(c.id, { position: 0 });

    expect(database.client.$transaction).toHaveBeenCalledTimes(1);
    expect(database.client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(galleryKeys().map(({ alt }) => alt)).toEqual(['C', 'A', 'B']);
    expect(objects.has(a.imageKey)).toBe(true);
  });

  it('keeps a single hero and removes replaced hero files only after commit', async () => {
    const legacy = await database.client.siteMedia.create({
      data: {
        kind: 'HERO',
        imageKey: 'site/hero/main-1.webp',
        originalKey: 'site/hero/main-1.jpg',
      },
    });
    await database.client.siteMedia.create({
      data: { kind: 'HERO', imageKey: 'site/hero/duplicate.webp', position: 1 },
    });
    objects.add('site/hero/main-1.webp');
    objects.add('site/hero/duplicate.webp');

    const hero = await upload('HERO', 'Hero');

    const heroes = database.rows.filter((row) => row.kind === 'HERO');
    expect(heroes).toHaveLength(1);
    expect(heroes[0]).toMatchObject({ id: legacy.id, imageKey: hero.imageKey, position: 0 });
    expect(hero.imageKey).toMatch(/^site\/hero\/[0-9a-f-]{36}\.webp$/);
    expect(deletedKeys().sort()).toEqual(['site/hero/duplicate.webp', 'site/hero/main-1.webp']);
  });

  it('keeps the published hero when the replacement fails', async () => {
    await database.client.siteMedia.create({
      data: { kind: 'HERO', imageKey: 'site/hero/main-1.webp' },
    });
    objects.add('site/hero/main-1.webp');
    database.client.siteMedia.update.mockRejectedValueOnce(new Error('database down'));

    await expect(upload('HERO', 'Hero')).rejects.toThrow('database down');

    expect(objects.has('site/hero/main-1.webp')).toBe(true);
    expect(database.rows.map((row) => row.imageKey)).toEqual(['site/hero/main-1.webp']);
  });

  it('serves public and back office lists from the database only', async () => {
    objects.add('site/gallery/deleted-but-left-in-s3.webp');
    await upload('GALLERY', 'A');
    commands.length = 0;

    const publicMedia = await service.siteMedia(false);
    const backofficeMedia = await service.siteMedia(true);
    await service.mediaStorageStatus();

    expect(publicMedia.map((item) => item.alt)).toEqual(['A']);
    expect(backofficeMedia.map((item) => item.alt)).toEqual(['A']);
    expect(database.rows).toHaveLength(1);
    expect(commands.some((command) => command instanceof PutObjectCommand)).toBe(false);
  });

  it('does not need S3 credentials to list published media', async () => {
    await upload('GALLERY', 'A');
    Object.defineProperty(service, 'storage', {
      value: () => {
        throw new Error('S3_BUCKET must be configured for catalog image storage.');
      },
    });

    await expect(service.siteMedia(false)).resolves.toHaveLength(1);
  });

  it('imports unknown S3 objects only on manual sync, hidden and after existing photos', async () => {
    await upload('GALLERY', 'A');
    await upload('HERO', 'Hero');
    objects.add('site/gallery/orphan.webp');
    objects.add('site/hero/second-hero.webp');

    await service.synchronizeOriginalsFromStorage();

    const orphan = database.rows.find((row) => row.imageKey === 'site/gallery/orphan.webp');
    expect(orphan).toMatchObject({ isActive: false, position: 1 });
    expect(database.rows.filter((row) => row.kind === 'HERO')).toHaveLength(1);
    expect((await service.siteMedia(false)).map((item) => item.alt)).toEqual(['A', 'Hero']);
  });

  it('stores imported site originals under unique keys', async () => {
    await database.client.siteMedia.create({
      data: { kind: 'GALLERY', imageKey: 'site/gallery/gallery-1.webp' },
    });

    const result = await service.importSiteMediaOriginals([imageFile(png, 'gallery-1.png')]);

    expect(result.imported).toBe(1);
    expect(database.rows[0]?.originalKey).toMatch(/^site\/gallery\/[0-9a-f-]{36}\.png$/);
  });
});

function imageFile(buffer: Buffer, originalname = 'upload.png'): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
    stream: Readable.from(buffer),
    destination: '',
    filename: '',
    path: '',
  };
}
