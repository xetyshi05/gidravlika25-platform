import { readFileSync } from "node:fs";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/import-legacy-catalog.mjs <path-to-legacy-sql-dump>");
  process.exit(1);
}

const dump = readFileSync(inputPath, "utf8");

function parseValues(valueList) {
  const values = [];
  let index = 0;

  while (index < valueList.length) {
    while (/[\s,]/.test(valueList[index] ?? "")) index += 1;
    if (index >= valueList.length) break;

    if (valueList[index] === "'") {
      index += 1;
      let value = "";

      while (index < valueList.length) {
        const character = valueList[index];

        if (character === "\\") {
          const escaped = valueList[index + 1];
          if (escaped !== undefined) value += escaped;
          index += 2;
          continue;
        }

        if (character === "'") {
          index += 1;
          break;
        }

        value += character;
        index += 1;
      }

      values.push(value);
      continue;
    }

    const valueStart = index;
    while (index < valueList.length && valueList[index] !== ",") index += 1;
    const value = valueList.slice(valueStart, index).trim();
    values.push(value === "NULL" ? null : value);
  }

  return values;
}

function getRows(tableName) {
  const pattern = new RegExp(
    "^INSERT INTO `" + tableName + "` \\(([^)]+)\\) VALUES \\((.*)\\);$",
    "gm",
  );
  const rows = [];

  for (const match of dump.matchAll(pattern)) {
    const columns = match[1].split(", ").map((column) => column.replaceAll("`", ""));
    const values = parseValues(match[2]);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
    rows.push(row);
  }

  return rows;
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function toPlainText(value) {
  const text = decodeHtml(value)
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

function getNumber(value) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getMetric(description, label) {
  const escapedLabel = label.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = decodeHtml(description).match(
    new RegExp(`<td[^>]*>\\s*${escapedLabel}[^<]*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"),
  );
  return getNumber(match?.[1]?.replaceAll(/<[^>]*>/g, "").trim());
}

function getDimensionsFromModel(model) {
  const dimensions = model.match(/\d+/g) ?? [];
  return dimensions.slice(0, 4).map((dimension) => Math.trunc(getNumber(dimension) ?? 0));
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  return value === null || value === undefined ? "NULL" : String(value);
}

function legacyCategoryId(categoryId) {
  return `legacy-category-${categoryId}`;
}

const categories = getRows("az_category").filter((category) => category.status === "1");
const categoryDescriptions = new Map(
  getRows("az_category_description")
    .filter((description) => description.language_id === "1")
    .map((description) => [description.category_id, description]),
);
const products = getRows("az_product").filter((product) => product.status === "1");
const productDescriptions = new Map(
  getRows("az_product_description")
    .filter((description) => description.language_id === "1")
    .map((description) => [description.product_id, description]),
);
const productCategories = new Map(
  getRows("az_product_to_category").map((relation) => [relation.product_id, relation.category_id]),
);
const knownCategoryIds = new Set(categories.map((category) => category.category_id));
const rootCategory = categories.find((category) => category.parent_id === "0");

if (!rootCategory || products.length === 0 || categories.length === 0) {
  throw new Error("Legacy dump does not contain an importable product catalog.");
}

const categoryDepth = (category) => {
  let depth = 0;
  let parentId = category.parent_id;
  const visited = new Set([category.category_id]);

  while (parentId && parentId !== "0" && knownCategoryIds.has(parentId) && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = categories.find((candidate) => candidate.category_id === parentId)?.parent_id;
  }

  return depth;
};

const usedSkus = new Set();
const catalogSql = ["BEGIN;"];

for (const category of [...categories].sort(
  (left, right) => categoryDepth(left) - categoryDepth(right),
)) {
  const description = categoryDescriptions.get(category.category_id);
  const name = decodeHtml(description?.name ?? `Категория ${category.category_id}`);
  const parentId =
    category.parent_id !== "0" && knownCategoryIds.has(category.parent_id)
      ? legacyCategoryId(category.parent_id)
      : null;

  catalogSql.push(
    `INSERT INTO "Category" ("id", "legacyId", "name", "slug", "description", "parentId", "isActive", "updatedAt") VALUES (${sqlString(legacyCategoryId(category.category_id))}, ${sqlNumber(category.category_id)}, ${sqlString(name)}, ${sqlString(`legacy-category-${category.category_id}`)}, ${sqlString(toPlainText(description?.description ?? ""))}, ${sqlString(parentId)}, true, CURRENT_TIMESTAMP) ON CONFLICT ("legacyId") DO UPDATE SET "name" = EXCLUDED."name", "slug" = EXCLUDED."slug", "description" = EXCLUDED."description", "parentId" = EXCLUDED."parentId", "isActive" = EXCLUDED."isActive", "updatedAt" = CURRENT_TIMESTAMP;`,
  );
}

for (const product of products) {
  const legacyId = Number(product.product_id);
  const description = productDescriptions.get(product.product_id);
  const rawDescription = description?.description ?? "";
  const dimensions = getDimensionsFromModel(product.model ?? "");
  const pistonDiameterMm = getMetric(rawDescription, "Диаметр поршня, мм") ?? dimensions[0] ?? null;
  const rodDiameterMm = getMetric(rawDescription, "Диаметр штока, мм") ?? dimensions[1] ?? null;
  const strokeMm = getMetric(rawDescription, "Рабочий ход штока, мм") ?? dimensions[2] ?? null;
  const collapsedLengthMm =
    getMetric(rawDescription, "Размер в сложенном состоянии по осям крепления, мм") ??
    dimensions[3] ??
    null;
  const maxPressureMpa = getMetric(rawDescription, "Максимальное давление, МПа");
  const nominalPressureMpa = getMetric(rawDescription, "Номинальное давление, МПа");
  const baseSku = decodeHtml(product.isbn ?? "").trim() || `LEGACY-${legacyId}`;
  const sku = usedSkus.has(baseSku) ? `${baseSku}-${legacyId}` : baseSku;
  const categoryId = productCategories.get(product.product_id);
  const resolvedCategoryId =
    categoryId && knownCategoryIds.has(categoryId) ? categoryId : rootCategory.category_id;

  usedSkus.add(sku);
  catalogSql.push(
    `INSERT INTO "Product" ("id", "legacyId", "sku", "name", "slug", "description", "shortDescription", "price", "pistonDiameterMm", "rodDiameterMm", "strokeMm", "collapsedLengthMm", "maxPressureMpa", "nominalPressureMpa", "imageKey", "stockQuantity", "isActive", "isFeatured", "categoryId", "updatedAt") VALUES (${sqlString(`legacy-product-${legacyId}`)}, ${sqlNumber(legacyId)}, ${sqlString(sku)}, ${sqlString(decodeHtml(description?.name ?? product.model ?? `Гидроцилиндр ${legacyId}`))}, ${sqlString(`gidrotsilindr-${legacyId}`)}, ${sqlString(toPlainText(rawDescription))}, ${sqlString(decodeHtml(description?.tag ?? "").trim() || null)}, ${sqlNumber(getNumber(product.price) ?? 0)}, ${sqlNumber(pistonDiameterMm)}, ${sqlNumber(rodDiameterMm)}, ${sqlNumber(strokeMm)}, ${sqlNumber(collapsedLengthMm)}, ${sqlNumber(maxPressureMpa)}, ${sqlNumber(nominalPressureMpa)}, ${sqlString(`catalog/${legacyId}.webp`)}, ${sqlNumber(Math.max(0, Math.trunc(getNumber(product.quantity) ?? 0)))}, true, false, ${sqlString(legacyCategoryId(resolvedCategoryId))}, CURRENT_TIMESTAMP) ON CONFLICT ("legacyId") DO UPDATE SET "sku" = EXCLUDED."sku", "name" = EXCLUDED."name", "slug" = EXCLUDED."slug", "description" = EXCLUDED."description", "shortDescription" = EXCLUDED."shortDescription", "price" = EXCLUDED."price", "pistonDiameterMm" = EXCLUDED."pistonDiameterMm", "rodDiameterMm" = EXCLUDED."rodDiameterMm", "strokeMm" = EXCLUDED."strokeMm", "collapsedLengthMm" = EXCLUDED."collapsedLengthMm", "maxPressureMpa" = EXCLUDED."maxPressureMpa", "nominalPressureMpa" = EXCLUDED."nominalPressureMpa", "imageKey" = EXCLUDED."imageKey", "stockQuantity" = EXCLUDED."stockQuantity", "isActive" = EXCLUDED."isActive", "categoryId" = EXCLUDED."categoryId", "updatedAt" = CURRENT_TIMESTAMP;`,
  );
}

catalogSql.push("COMMIT;");
console.error(
  `Prepared ${categories.length} categories and ${products.length} products for import.`,
);
process.stdout.write(`${catalogSql.join("\n")}\n`);
