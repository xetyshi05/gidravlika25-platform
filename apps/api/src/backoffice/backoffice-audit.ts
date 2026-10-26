import { Prisma } from '@prisma/client';

type AuditClient = Pick<Prisma.TransactionClient, 'backofficeActivity'>;
type AuditValue = string | number | boolean | null;
export type AuditRecord = Record<string, AuditValue>;

/**
 * Writes a Back Office journal entry. Mutations pass their transaction client,
 * so the change and its audit record are committed or rolled back together.
 */
export function recordBackofficeActivity(
  client: AuditClient,
  userId: string,
  action: string,
  entity: string,
  details?: Record<string, unknown>,
) {
  return client.backofficeActivity.create({
    data: {
      userId,
      action,
      entity,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
}

export function auditChanges(before: AuditRecord, after: AuditRecord) {
  return Object.fromEntries(
    Object.entries(after)
      .filter(([key, value]) => !Object.is(before[key], value))
      .map(([key, value]) => [key, { from: before[key] ?? null, to: value }]),
  );
}

export function compactValues(values: Record<string, AuditValue | undefined>): AuditRecord {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, AuditValue] => entry[1] !== undefined),
  );
}

export function userAuditValues(user: {
  name: string;
  login: string;
  role: string;
  isActive: boolean;
}): AuditRecord {
  return { name: user.name, login: user.login, role: user.role, isActive: user.isActive };
}

export function productAuditValues(product: {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  price: string;
  pistonDiameterMm: number | null;
  rodDiameterMm: number | null;
  strokeMm: number | null;
  collapsedLengthMm: number | null;
  maxPressureMpa: string | null;
  nominalPressureMpa: string | null;
  stockQuantity: number;
  isActive: boolean;
  isFeatured: boolean;
  category: { name: string };
}): AuditRecord {
  return {
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    category: product.category.name,
    price: product.price,
    description: product.description,
    shortDescription: product.shortDescription,
    pistonDiameterMm: product.pistonDiameterMm,
    rodDiameterMm: product.rodDiameterMm,
    strokeMm: product.strokeMm,
    collapsedLengthMm: product.collapsedLengthMm,
    maxPressureMpa: product.maxPressureMpa,
    nominalPressureMpa: product.nominalPressureMpa,
    stockQuantity: product.stockQuantity,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
  };
}

export function categoryAuditValues(category: {
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  parent: { name: string } | null;
}): AuditRecord {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    parent: category.parent?.name ?? null,
    isActive: category.isActive,
  };
}

export const AUDIT_ITEMS_LIMIT = 25;

export function auditItems(items: Array<{ id: string; name: string; sku?: string }>) {
  return items
    .slice(0, AUDIT_ITEMS_LIMIT)
    .map(({ id, name, sku }) => ({ id, name, ...(sku ? { sku } : {}) }));
}
