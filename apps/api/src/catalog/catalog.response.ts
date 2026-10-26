// Response bodies of the public catalog (ARCH-01). The @nestjs/swagger plugin
// describes these classes from their TypeScript types; the service is typed
// with them, so the OpenAPI document cannot drift from what it returns.

export class CatalogCategory {
  id!: string;
  name!: string;
  slug!: string;
  productCount!: number;
}

export class CatalogProductCategory {
  name!: string;
  slug!: string;
}

export class CatalogProduct {
  id!: string;
  slug!: string;
  name!: string;
  description!: string | null;
  shortDescription!: string | null;
  sku!: string;
  imagePath!: string | null;
  /** Decimal as a string, e.g. "12500.00"; null when prices are hidden. */
  price!: string | null;
  stockQuantity!: number;
  stockStatus!: 'IN_STOCK' | 'LOW_STOCK' | 'MADE_TO_ORDER';
  pistonDiameterMm!: number | null;
  rodDiameterMm!: number | null;
  strokeMm!: number | null;
  collapsedLengthMm!: number | null;
  maxPressureMpa!: string | null;
  nominalPressureMpa!: string | null;
  category!: CatalogProductCategory;
}

export class CatalogSitemapProduct {
  slug!: string;
  updatedAt!: Date;
}

export class CatalogProductsPage {
  items!: CatalogProduct[];
  page!: number;
  pageSize!: number;
  total!: number;
  totalPages!: number;
}

export class CatalogNumericRange {
  min!: string | null;
  max!: string | null;
}

export class CatalogProductFilterRanges {
  price!: CatalogNumericRange;
  pistonDiameterMm!: CatalogNumericRange;
  rodDiameterMm!: CatalogNumericRange;
  strokeMm!: CatalogNumericRange;
  collapsedLengthMm!: CatalogNumericRange;
  maxPressureMpa!: CatalogNumericRange;
  nominalPressureMpa!: CatalogNumericRange;
}

export class PublicCatalogSettings {
  lowStockThreshold!: number;
  showOutOfStock!: boolean;
  showPrices!: boolean;
}
