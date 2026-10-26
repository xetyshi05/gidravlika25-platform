import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { defaultCatalogSettings } from './catalog-settings';

describe('CatalogService settings', () => {
  const productRecord = {
    id: 'product-1',
    slug: 'product-1',
    name: 'Гидроцилиндр',
    description: null,
    shortDescription: null,
    sku: 'SKU-1',
    imageKey: null,
    price: new Prisma.Decimal('12500'),
    stockQuantity: 2,
    pistonDiameterMm: 50,
    rodDiameterMm: 25,
    strokeMm: 200,
    collapsedLengthMm: 400,
    maxPressureMpa: new Prisma.Decimal('25'),
    nominalPressureMpa: new Prisma.Decimal('16'),
    category: { name: 'Гидроцилиндры', slug: 'gidrocilindry' },
  };

  function fixture(
    settings: {
      lowStockThreshold: number;
      showOutOfStock: boolean;
      showPrices: boolean;
    } | null,
  ) {
    const catalogSettings = { findUnique: jest.fn().mockResolvedValue(settings) };
    const product = {
      findMany: jest.fn().mockResolvedValue([productRecord]),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({
        _min: productRecord,
        _max: productRecord,
      }),
      findFirst: jest.fn().mockResolvedValue(productRecord),
    };
    const category = { findMany: jest.fn().mockResolvedValue([]) };
    const service = new CatalogService({
      catalogSettings,
      product,
      category,
    } as unknown as PrismaService);
    return { service, catalogSettings, product, category };
  }

  it('uses safe defaults when the settings row has not been created yet', async () => {
    const { service } = fixture(null);

    await expect(service.getSettings()).resolves.toEqual(defaultCatalogSettings);
  });

  it('hides prices, excludes zero stock and marks low stock from the configured threshold', async () => {
    const { service, product } = fixture({
      lowStockThreshold: 3,
      showOutOfStock: false,
      showPrices: false,
    });

    const result = await service.getProductsPage({
      page: 1,
      pageSize: 24,
      minPrice: 1,
      maxPrice: 99_999,
    });

    expect(product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, stockQuantity: { gt: 0 } },
      }),
    );
    expect(product.count).toHaveBeenCalledWith({
      where: { isActive: true, stockQuantity: { gt: 0 } },
    });
    expect(result.items[0]).toMatchObject({
      price: null,
      stockQuantity: 2,
      stockStatus: 'LOW_STOCK',
    });
  });

  it('does not allow the made-to-order filter to bypass hidden zero-stock products', async () => {
    const { service, product } = fixture({
      lowStockThreshold: 5,
      showOutOfStock: false,
      showPrices: true,
    });

    await service.getProductsPage({ page: 1, pageSize: 24, availability: 'made-to-order' });

    expect(product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, stockQuantity: { lt: 0 } },
      }),
    );
  });

  it('hides a direct product page when zero-stock products are disabled', async () => {
    const { service, product } = fixture({
      lowStockThreshold: 5,
      showOutOfStock: false,
      showPrices: true,
    });
    product.findFirst.mockResolvedValue(null);

    await expect(service.getProductBySlug('hidden-product')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'hidden-product', isActive: true, stockQuantity: { gt: 0 } },
      }),
    );
  });

  it('removes the public price range when prices are disabled', async () => {
    const { service } = fixture({
      lowStockThreshold: 5,
      showOutOfStock: true,
      showPrices: false,
    });

    await expect(service.getProductFilterRanges()).resolves.toMatchObject({
      price: { min: null, max: null },
    });
  });
});
