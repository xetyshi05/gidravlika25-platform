export type RequestedRange = {
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Full catalog range: a side equal to its bound was not narrowed by the visitor. */
  boundsMin: number;
  boundsMax: number;
};

const formatNumber = (value: number) => String(value).replace(".", ",");

/**
 * Builds the comment prefilled into the custom-production request when the catalog
 * has nothing for the visitor's filters, so the manager sees what was searched for.
 */
export function customOrderComment({
  search,
  categories,
  ranges,
}: {
  search?: string;
  categories: string[];
  ranges: RequestedRange[];
}) {
  const details: string[] = [];
  if (categories.length > 0) details.push(`категория — ${categories.join(", ")}`);
  for (const range of ranges) {
    const narrowedMin = range.min > range.boundsMin;
    const narrowedMax = range.max < range.boundsMax;
    if (!narrowedMin && !narrowedMax) continue;
    const value =
      range.min === range.max
        ? formatNumber(range.min)
        : narrowedMin && narrowedMax
          ? `от ${formatNumber(range.min)} до ${formatNumber(range.max)}`
          : narrowedMin
            ? `от ${formatNumber(range.min)}`
            : `до ${formatNumber(range.max)}`;
    details.push(`${range.label.toLowerCase()} — ${value} ${range.unit}`);
  }
  const query = search?.trim();
  if (query) details.push(`поиск — «${query}»`);
  return details.length > 0
    ? `В каталоге не нашлось подходящего гидроцилиндра. Нужно: ${details.join("; ")}.`
    : "";
}
