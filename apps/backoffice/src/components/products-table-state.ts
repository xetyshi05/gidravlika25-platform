export type ProductTableFilterState = {
  id: string;
  mode: string;
  value?: string;
  values?: string[];
};

export function filtersForAttention(attention: string | null): ProductTableFilterState[] | null {
  if (attention === "without-image") return [{ id: "image", mode: "anyOf", values: ["none"] }];
  if (attention === "without-price") return [{ id: "price", mode: "equals", value: "0" }];
  if (attention === "out-of-stock") return [{ id: "stock", mode: "anyOf", values: ["none"] }];
  if (attention === "inactive") return [{ id: "active", mode: "anyOf", values: ["false"] }];
  return null;
}

export function productsEmptyState(activeFilterCount: number) {
  return activeFilterCount > 0
    ? {
        title: "Товары не найдены",
        description: "По заданным фильтрам нет результатов.",
        canResetFilters: true,
      }
    : {
        title: "Товары пока не добавлены",
        description: "Добавьте первый товар кнопкой в панели таблицы.",
        canResetFilters: false,
      };
}
