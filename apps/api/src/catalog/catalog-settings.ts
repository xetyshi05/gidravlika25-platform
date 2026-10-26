import type { PublicCatalogSettings } from './catalog.response';

export type { PublicCatalogSettings };

export const defaultCatalogSettings: PublicCatalogSettings = {
  lowStockThreshold: 5,
  showOutOfStock: true,
  showPrices: true,
};
