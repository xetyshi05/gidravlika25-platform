export type CatalogSettings = {
  lowStockThreshold: number;
  showOutOfStock: boolean;
  showPrices: boolean;
};

export function catalogSettingsPayload(values: CatalogSettings): CatalogSettings {
  return {
    lowStockThreshold: values.lowStockThreshold,
    showOutOfStock: values.showOutOfStock,
    showPrices: values.showPrices,
  };
}
