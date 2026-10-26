import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  CatalogCategory,
  CatalogProduct,
  CatalogSitemapProduct,
  CatalogService,
} from './catalog.service';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 24;
const MAX_PAGE_SIZE = 48;
/** Public deep links are clamped rather than rejected (PERF-01): 48 000 products at most. */
const MAX_CATALOG_PAGE = 1_000;

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_CATALOG_PAGE) : 1;
}

function parsePageSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 24;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCategories(value: string | undefined): string[] | undefined {
  const categories = value
    ?.split(',')
    .map((category) => category.trim())
    .filter(Boolean);

  return categories && categories.length > 0 ? categories : undefined;
}

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  getCategories(@Query('limit') limit?: string): Promise<CatalogCategory[]> {
    return this.catalogService.getCategories(parseLimit(limit, DEFAULT_LIMIT));
  }

  @Get('settings')
  getSettings() {
    return this.catalogService.getSettings();
  }

  @Get('products')
  getProducts(@Query('limit') limit?: string): Promise<CatalogProduct[]> {
    return this.catalogService.getProducts(parseLimit(limit, 4));
  }

  @Get('products/page')
  getProductsPage(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('minPistonDiameter') minPistonDiameter?: string,
    @Query('maxPistonDiameter') maxPistonDiameter?: string,
    @Query('minRodDiameter') minRodDiameter?: string,
    @Query('maxRodDiameter') maxRodDiameter?: string,
    @Query('availability') availability?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minStroke') minStroke?: string,
    @Query('maxStroke') maxStroke?: string,
    @Query('minCollapsedLength') minCollapsedLength?: string,
    @Query('maxCollapsedLength') maxCollapsedLength?: string,
    @Query('minMaxPressure') minMaxPressure?: string,
    @Query('maxMaxPressure') maxMaxPressure?: string,
    @Query('minNominalPressure') minNominalPressure?: string,
    @Query('maxNominalPressure') maxNominalPressure?: string,
  ) {
    return this.catalogService.getProductsPage({
      page: parsePage(page),
      pageSize: parsePageSize(pageSize),
      search: search?.trim() || undefined,
      categories: parseCategories(category),
      minPistonDiameterMm: parseNumber(minPistonDiameter),
      maxPistonDiameterMm: parseNumber(maxPistonDiameter),
      minRodDiameterMm: parseNumber(minRodDiameter),
      maxRodDiameterMm: parseNumber(maxRodDiameter),
      availability:
        availability === 'in-stock' || availability === 'made-to-order' ? availability : undefined,
      minPrice: parseNumber(minPrice),
      maxPrice: parseNumber(maxPrice),
      minStrokeMm: parseNumber(minStroke),
      maxStrokeMm: parseNumber(maxStroke),
      minCollapsedLengthMm: parseNumber(minCollapsedLength),
      maxCollapsedLengthMm: parseNumber(maxCollapsedLength),
      minMaxPressureMpa: parseNumber(minMaxPressure),
      maxMaxPressureMpa: parseNumber(maxMaxPressure),
      minNominalPressureMpa: parseNumber(minNominalPressure),
      maxNominalPressureMpa: parseNumber(maxNominalPressure),
    });
  }

  @Get('products/filters')
  getProductFilters() {
    return this.catalogService.getProductFilterRanges();
  }

  @Get('products/sitemap')
  getSitemapProducts(): Promise<CatalogSitemapProduct[]> {
    return this.catalogService.getSitemapProducts();
  }

  @Get('products/:slug')
  getProductBySlug(@Param('slug') slug: string): Promise<CatalogProduct> {
    return this.catalogService.getProductBySlug(slug);
  }
}
