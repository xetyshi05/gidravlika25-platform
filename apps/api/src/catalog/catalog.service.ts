import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCatalogImagePath } from './catalog-image-path';
import { defaultCatalogSettings, type PublicCatalogSettings } from './catalog-settings';

import {
  CatalogCategory,
  CatalogProduct,
  CatalogProductFilterRanges,
  CatalogProductsPage,
  CatalogSitemapProduct,
} from './catalog.response';

export {
  CatalogCategory,
  CatalogProduct,
  CatalogProductFilterRanges,
  CatalogProductsPage,
  CatalogSitemapProduct,
};

type CatalogNumericRange = CatalogProductFilterRanges['price'];

type CatalogProductFilters = {
  page: number;
  pageSize: number;
  search?: string;
  categories?: string[];
  minPistonDiameterMm?: number;
  maxPistonDiameterMm?: number;
  minRodDiameterMm?: number;
  maxRodDiameterMm?: number;
  availability?: 'in-stock' | 'made-to-order';
  minPrice?: number;
  maxPrice?: number;
  minStrokeMm?: number;
  maxStrokeMm?: number;
  minCollapsedLengthMm?: number;
  maxCollapsedLengthMm?: number;
  minMaxPressureMpa?: number;
  maxMaxPressureMpa?: number;
  minNominalPressureMpa?: number;
  maxNominalPressureMpa?: number;
};

type NumberRangeFilter = {
  gte?: number;
  lte?: number;
};

type ProductRecord = Omit<
  CatalogProduct,
  'imagePath' | 'price' | 'stockStatus' | 'maxPressureMpa' | 'nominalPressureMpa'
> & {
  imageKey: string | null;
  price: { toString(): string };
  maxPressureMpa: { toString(): string } | null;
  nominalPressureMpa: { toString(): string } | null;
};

const productSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  shortDescription: true,
  sku: true,
  imageKey: true,
  price: true,
  stockQuantity: true,
  pistonDiameterMm: true,
  rodDiameterMm: true,
  strokeMm: true,
  collapsedLengthMm: true,
  maxPressureMpa: true,
  nominalPressureMpa: true,
  category: {
    select: {
      name: true,
      slug: true,
    },
  },
} as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<PublicCatalogSettings> {
    const settings = await this.prisma.catalogSettings.findUnique({
      where: { id: 'catalog' },
      select: {
        lowStockThreshold: true,
        showOutOfStock: true,
        showPrices: true,
      },
    });
    return settings ?? defaultCatalogSettings;
  }

  async getCategories(limit: number): Promise<CatalogCategory[]> {
    const settings = await this.getSettings();
    const visibleProductWhere = this.getVisibleProductWhere(settings);
    const categories = await this.prisma.category.findMany({
      where: {
        isActive: true,
        products: {
          some: visibleProductWhere,
        },
      },
      orderBy: { legacyId: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            products: {
              where: visibleProductWhere,
            },
          },
        },
      },
    });

    return categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        productCount: category._count.products,
      }))
      .sort(
        (left, right) => this.getCategoryDiameter(left.name) - this.getCategoryDiameter(right.name),
      )
      .slice(0, limit);
  }

  async getProducts(limit: number): Promise<CatalogProduct[]> {
    const settings = await this.getSettings();
    const products = await this.prisma.product.findMany({
      where: this.getVisibleProductWhere(settings),
      orderBy: [{ stockQuantity: 'desc' }, { name: 'asc' }],
      take: limit,
      select: productSelect,
    });

    return products.map((product) => this.toCatalogProduct(product, settings));
  }

  async getSitemapProducts(): Promise<CatalogSitemapProduct[]> {
    const settings = await this.getSettings();
    return this.prisma.product.findMany({
      where: this.getVisibleProductWhere(settings),
      orderBy: { slug: 'asc' },
      select: { slug: true, updatedAt: true },
    });
  }

  async getProductsPage(filters: CatalogProductFilters): Promise<CatalogProductsPage> {
    const settings = await this.getSettings();
    const where = this.getProductsWhere(filters, settings);
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ stockQuantity: 'desc' }, { name: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        select: productSelect,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: products.map((product) => this.toCatalogProduct(product, settings)),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.ceil(total / filters.pageSize),
    };
  }

  async getProductFilterRanges(): Promise<CatalogProductFilterRanges> {
    const settings = await this.getSettings();
    const ranges = await this.prisma.product.aggregate({
      where: this.getVisibleProductWhere(settings),
      _min: {
        price: true,
        pistonDiameterMm: true,
        rodDiameterMm: true,
        strokeMm: true,
        collapsedLengthMm: true,
        maxPressureMpa: true,
        nominalPressureMpa: true,
      },
      _max: {
        price: true,
        pistonDiameterMm: true,
        rodDiameterMm: true,
        strokeMm: true,
        collapsedLengthMm: true,
        maxPressureMpa: true,
        nominalPressureMpa: true,
      },
    });

    return {
      price: settings.showPrices
        ? this.toRange(ranges._min.price, ranges._max.price)
        : { min: null, max: null },
      pistonDiameterMm: this.toRange(ranges._min.pistonDiameterMm, ranges._max.pistonDiameterMm),
      rodDiameterMm: this.toRange(ranges._min.rodDiameterMm, ranges._max.rodDiameterMm),
      strokeMm: this.toRange(ranges._min.strokeMm, ranges._max.strokeMm),
      collapsedLengthMm: this.toRange(ranges._min.collapsedLengthMm, ranges._max.collapsedLengthMm),
      maxPressureMpa: this.toRange(ranges._min.maxPressureMpa, ranges._max.maxPressureMpa),
      nominalPressureMpa: this.toRange(
        ranges._min.nominalPressureMpa,
        ranges._max.nominalPressureMpa,
      ),
    };
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct> {
    const settings = await this.getSettings();
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        ...this.getVisibleProductWhere(settings),
      },
      select: productSelect,
    });

    if (!product) {
      throw new NotFoundException('Товар не найден.');
    }

    return this.toCatalogProduct(product, settings);
  }

  private toCatalogProduct(
    product: ProductRecord,
    settings: PublicCatalogSettings,
  ): CatalogProduct {
    const { imageKey, ...catalogProduct } = product;

    return {
      ...catalogProduct,
      imagePath: resolveCatalogImagePath(imageKey, process.env.S3_PUBLIC_URL),
      price: settings.showPrices ? product.price.toString() : null,
      stockStatus:
        product.stockQuantity === 0
          ? 'MADE_TO_ORDER'
          : product.stockQuantity <= settings.lowStockThreshold
            ? 'LOW_STOCK'
            : 'IN_STOCK',
      maxPressureMpa: product.maxPressureMpa?.toString() ?? null,
      nominalPressureMpa: product.nominalPressureMpa?.toString() ?? null,
    };
  }

  private getProductsWhere(
    filters: CatalogProductFilters,
    settings: PublicCatalogSettings,
  ): Prisma.ProductWhereInput {
    return {
      ...this.getVisibleProductWhere(settings),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { sku: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filters.categories ? { category: { is: { slug: { in: filters.categories } } } } : {}),
      ...(this.getRangeFilter(filters.minPistonDiameterMm, filters.maxPistonDiameterMm)
        ? {
            pistonDiameterMm: this.getRangeFilter(
              filters.minPistonDiameterMm,
              filters.maxPistonDiameterMm,
            ),
          }
        : {}),
      ...(this.getRangeFilter(filters.minRodDiameterMm, filters.maxRodDiameterMm)
        ? {
            rodDiameterMm: this.getRangeFilter(filters.minRodDiameterMm, filters.maxRodDiameterMm),
          }
        : {}),
      ...(filters.availability === 'in-stock' ? { stockQuantity: { gt: 0 } } : {}),
      ...(filters.availability === 'made-to-order'
        ? { stockQuantity: settings.showOutOfStock ? 0 : { lt: 0 } }
        : {}),
      ...(settings.showPrices && this.getRangeFilter(filters.minPrice, filters.maxPrice)
        ? { price: this.getRangeFilter(filters.minPrice, filters.maxPrice) }
        : {}),
      ...(this.getRangeFilter(filters.minStrokeMm, filters.maxStrokeMm)
        ? {
            strokeMm: this.getRangeFilter(filters.minStrokeMm, filters.maxStrokeMm),
          }
        : {}),
      ...(this.getRangeFilter(filters.minCollapsedLengthMm, filters.maxCollapsedLengthMm)
        ? {
            collapsedLengthMm: this.getRangeFilter(
              filters.minCollapsedLengthMm,
              filters.maxCollapsedLengthMm,
            ),
          }
        : {}),
      ...(this.getRangeFilter(filters.minMaxPressureMpa, filters.maxMaxPressureMpa)
        ? {
            maxPressureMpa: this.getRangeFilter(
              filters.minMaxPressureMpa,
              filters.maxMaxPressureMpa,
            ),
          }
        : {}),
      ...(this.getRangeFilter(filters.minNominalPressureMpa, filters.maxNominalPressureMpa)
        ? {
            nominalPressureMpa: this.getRangeFilter(
              filters.minNominalPressureMpa,
              filters.maxNominalPressureMpa,
            ),
          }
        : {}),
    };
  }

  private getVisibleProductWhere(settings: PublicCatalogSettings): Prisma.ProductWhereInput {
    return {
      isActive: true,
      ...(settings.showOutOfStock ? {} : { stockQuantity: { gt: 0 } }),
    };
  }

  private getRangeFilter(
    min: number | undefined,
    max: number | undefined,
  ): NumberRangeFilter | undefined {
    if (min === undefined && max === undefined) {
      return undefined;
    }

    return {
      ...(min !== undefined ? { gte: min } : {}),
      ...(max !== undefined ? { lte: max } : {}),
    };
  }

  private toRange(
    min: { toString(): string } | number | null,
    max: { toString(): string } | number | null,
  ): CatalogNumericRange {
    return { min: min?.toString() ?? null, max: max?.toString() ?? null };
  }

  private getCategoryDiameter(categoryName: string): number {
    const diameter = categoryName.match(/\d+/)?.[0];
    return diameter ? Number.parseInt(diameter, 10) : Number.MAX_SAFE_INTEGER;
  }
}
