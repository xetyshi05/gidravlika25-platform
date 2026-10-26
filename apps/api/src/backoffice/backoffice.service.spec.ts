import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BackofficeService } from './backoffice.service';

describe('BackofficeService regressions', () => {
  it('does not expose persistence-only fields in catalog settings', async () => {
    const catalogSettings = {
      upsert: jest.fn().mockResolvedValue({
        lowStockThreshold: 5,
        showOutOfStock: true,
        showPrices: true,
      }),
    };
    const service = new BackofficeService({ catalogSettings } as unknown as PrismaService);

    await service.settings();

    expect(catalogSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'catalog' },
      create: { id: 'catalog' },
      update: {},
      select: {
        lowStockThreshold: true,
        showOutOfStock: true,
        showPrices: true,
      },
    });
  });

  it('exposes a resolved imagePath without leaking storage fields', async () => {
    const previousPublicUrl = process.env.S3_PUBLIC_URL;
    process.env.S3_PUBLIC_URL = 'https://cdn.example/bucket';
    const product = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'product-1',
        sku: 'SKU-1',
        name: 'Product',
        slug: 'product',
        description: null,
        shortDescription: null,
        price: new Prisma.Decimal(100),
        pistonDiameterMm: null,
        rodDiameterMm: null,
        strokeMm: null,
        collapsedLengthMm: null,
        maxPressureMpa: null,
        nominalPressureMpa: null,
        imageKey: 'catalog/product-1/image.webp',
        stockQuantity: 1,
        isActive: true,
        isFeatured: false,
        categoryId: 'category-1',
        category: { id: 'category-1', name: 'Category', slug: 'category' },
        updatedAt: new Date('2026-09-08T00:00:00.000Z'),
      }),
    };
    const service = new BackofficeService({ product } as unknown as PrismaService);

    try {
      const result = await service.productById('product-1');

      expect(result).toMatchObject({
        imagePath: 'https://cdn.example/bucket/catalog/product-1/image.webp',
      });
      expect(result).not.toHaveProperty('imageKey');
    } finally {
      if (previousPublicUrl === undefined) delete process.env.S3_PUBLIC_URL;
      else process.env.S3_PUBLIC_URL = previousPublicUrl;
    }
  });

  it('filters categories by the exact number of products', async () => {
    const product = {
      groupBy: jest.fn().mockResolvedValue([
        { categoryId: 'category-1', _count: { _all: 2 } },
        { categoryId: 'category-2', _count: { _all: 4 } },
      ]),
    };
    const category = {
      findMany: jest.fn().mockResolvedValue([{ id: 'category-1' }]),
    };
    const service = new BackofficeService({
      product,
      category,
    } as unknown as PrismaService);

    await service.categories({
      idsOnly: true,
      filters: JSON.stringify({ productCount: '2' }),
    });

    expect(category.findMany).toHaveBeenCalledWith({
      where: {
        AND: [{}, { id: { in: ['category-1'] } }],
      },
      select: { id: true },
    });
  });

  it('maps an asynchronous duplicate-login error to HTTP 409', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    const { service } = transactional({
      user: { create: jest.fn().mockRejectedValue(duplicate) },
    });

    await expect(
      service.createUser(
        {
          name: 'Администратор',
          login: 'admin',
          password: 'strong-password',
          role: 'ADMIN',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes products, queues their files and records the audit entry in one transaction', async () => {
    const product = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'p-1',
          sku: '1',
          name: 'A',
          stockQuantity: 1,
          imageKey: 'catalog/p-1/a.webp',
          imageOriginalKey: 'catalog/p-1/a.png',
        },
        {
          id: 'p-2',
          sku: '2',
          name: 'B',
          stockQuantity: 0,
          imageKey: null,
          imageOriginalKey: null,
        },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const storageCleanup = { createMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const { service, tx, prisma } = transactional({ product, storageCleanup });
    const files = [
      { location: 'PUBLIC_BUCKET', key: 'catalog/p-1/a.webp' },
      { location: 'ORIGINALS', key: 'catalog/p-1/a.png' },
    ];

    await expect(service.deleteProducts(['p-1', 'p-2'], 'admin-1')).resolves.toEqual({
      deleted: 2,
      files,
    });
    // Queued in the same transaction, so a crash after the commit cannot orphan the files.
    expect(storageCleanup.createMany).toHaveBeenCalledWith({
      data: files.map((file) => ({ ...file, reason: 'product deletion' })),
      skipDuplicates: true,
    });
    expect(product.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p-1', 'p-2'] } } });
    expect(tx.backofficeActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        action: 'PRODUCTS_DELETED',
        details: expect.objectContaining({ count: 2 }) as unknown,
      }) as unknown,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fails the mutation when its audit record cannot be written', async () => {
    const auditFailure = new Error('audit table unavailable');
    const { service } = transactional({
      category: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c-1', name: 'Категория' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      backofficeActivity: { create: jest.fn().mockRejectedValue(auditFailure) },
    });

    // The rejection aborts the surrounding transaction, so the update is rolled back.
    await expect(service.bulkUpdateCategories(['c-1'], false, 'admin-1')).rejects.toBe(
      auditFailure,
    );
  });

  it('drops pending 2FA challenges and the 2FA lock together with sessions on password reset', async () => {
    const { service, tx } = transactional({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', name: 'User', login: 'user' }),
        update: jest.fn().mockResolvedValue({}),
      },
      authSession: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      authTwoFactorChallenge: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      loginAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    });

    await service.updateUserPassword('user-1', 'new-password-123', 'admin-1');

    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(tx.authTwoFactorChallenge.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(tx.loginAttempt.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.backofficeActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'USER_PASSWORD_CHANGED' }) as unknown,
    });
  });

  describe('concurrent product edits', () => {
    const openedAt = new Date('2026-09-24T10:00:00.000Z');
    const current = {
      ...productRow(),
      updatedAt: openedAt,
    };

    it('rejects a save based on an outdated version without writing', async () => {
      const product = {
        findUnique: jest.fn().mockResolvedValue({
          ...current,
          updatedAt: new Date('2026-09-24T10:00:05.000Z'),
        }),
        update: jest.fn(),
      };
      const { service, tx } = transactional({ product });

      await expect(
        service.updateProduct(
          'product-1',
          { name: 'Новое', expectedUpdatedAt: openedAt.toISOString() },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(product.update).not.toHaveBeenCalled();
      expect(tx.backofficeActivity.create).not.toHaveBeenCalled();
    });

    it('answers 409 when another save commits between the read and the write', async () => {
      const product = {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: '7.10.0',
          }),
        ),
      };
      const { service } = transactional({ product });

      await expect(
        service.updateProduct(
          'product-1',
          { name: 'Новое', expectedUpdatedAt: openedAt.toISOString() },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'product-1', updatedAt: openedAt },
          data: { name: 'Новое' },
        }),
      );
    });
  });

  it('changes stock with one atomic clamped increment under a row lock', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'p-1', sku: '1', name: 'Б', stockQuantity: 2 },
        { id: 'p-2', sku: '2', name: 'А', stockQuantity: 10 },
      ])
      .mockResolvedValueOnce([
        { id: 'p-1', stockQuantity: 0 },
        { id: 'p-2', stockQuantity: 7 },
      ]);
    const { service, tx } = transactional({ $queryRaw });

    await expect(service.bulkStock(['p-1', 'p-2'], -3, 'admin-1')).resolves.toEqual({
      updated: 2,
    });
    const [lock, update] = ($queryRaw.mock.calls as Array<[readonly string[]]>).map(([strings]) =>
      strings.join('?'),
    );
    expect(lock).toContain('FOR UPDATE');
    expect(update).toContain('GREATEST(0, "stockQuantity" + ?)');
    expect(tx.backofficeActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'STOCK_BULK_CHANGED',
        details: expect.objectContaining({
          count: 2,
          delta: -3,
          items: [
            { id: 'p-2', name: 'А', sku: '2' },
            { id: 'p-1', name: 'Б', sku: '1' },
          ],
        }) as unknown,
      }) as unknown,
    });
  });

  it('serializes demotions of administrators before checking the last one', async () => {
    const calls: string[] = [];
    const { service } = transactional({
      $executeRaw: jest.fn((strings: readonly string[]) => {
        calls.push(strings.join('?'));
        return Promise.resolve(1);
      }),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-2',
          name: 'Второй',
          login: 'second',
          role: 'ADMIN',
          isActive: true,
        }),
        count: jest.fn(() => {
          calls.push('count');
          return Promise.resolve(0);
        }),
        update: jest.fn(),
      },
    });

    await expect(
      service.updateUser('admin-2', { isActive: false }, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toEqual([
      expect.stringContaining("pg_advisory_xact_lock(hashtext('active-administrators'))"),
      'count',
    ]);
  });
});

/** A Prisma mock whose interactive transaction runs the callback with a separate client. */
function transactional(models: Record<string, unknown>) {
  const tx = {
    backofficeActivity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
    ...models,
  } as unknown as Record<string, Record<string, jest.Mock>>;
  const prisma = {
    backofficeActivity: { create: jest.fn() },
    $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) => callback(tx)),
  };
  return { service: new BackofficeService(prisma as unknown as PrismaService), tx, prisma };
}

function productRow() {
  return {
    id: 'product-1',
    sku: 'SKU-1',
    name: 'Product',
    slug: 'product',
    description: null,
    shortDescription: null,
    price: new Prisma.Decimal(100),
    pistonDiameterMm: null,
    rodDiameterMm: null,
    strokeMm: null,
    collapsedLengthMm: null,
    maxPressureMpa: null,
    nominalPressureMpa: null,
    imageKey: null,
    stockQuantity: 1,
    isActive: true,
    isFeatured: false,
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Category', slug: 'category' },
  };
}
