// Response bodies of /backoffice and /site-media (ARCH-01), described by the
// @nestjs/swagger plugin.
import type { Prisma, SiteMediaKind, UserRole } from '@prisma/client';
import { JsonObject } from '../openapi/api-property';

export class BackofficeUser {
  id!: string;
  name!: string;
  login!: string;
  role!: string;
}

export class ResourceUsage {
  usedBytes!: number;
  totalBytes!: number;
  usedPercent!: number;
}

export class CpuUsage {
  cores!: number;
  loadAverage1m!: number;
  loadPercent!: number;
}

export class ServerResources {
  status!: 'ok';
  checkedAt!: string;
  uptimeSeconds!: number;
  cpu!: CpuUsage;
  memory!: ResourceUsage;
  disk!: ResourceUsage | null;
}

/** An image of the site (hero, galleries) with its public URL. */
export class SiteMedia {
  id!: string;
  kind!: SiteMediaKind;
  imageKey!: string;
  imagePath!: string;
  alt!: string;
  title!: string | null;
  position!: number;
  isActive!: boolean;
  hasOriginal!: boolean;
}

/** A site image right after it was stored; the URL is null only without S3_PUBLIC_URL. */
export class StoredSiteMedia {
  id!: string;
  kind!: SiteMediaKind;
  imageKey!: string;
  imagePath!: string | null;
  originalKey!: string | null;
  alt!: string;
  title!: string | null;
  position!: number;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class MediaStorageGroupStatus {
  total!: number;
  originalsPresent!: number;
  publicImagesPresent!: number;
  ready!: number;
  missingOriginals!: number;
  missingPublicImages!: number;
}

export class MediaStorageStatus {
  checkedAt!: string;
  site!: MediaStorageGroupStatus;
  catalog!: MediaStorageGroupStatus;
}

export class OriginalsImportResult {
  imported!: number;
  alreadyPresent!: number;
  notMatched!: string[];
  ambiguous!: string[];
  duplicates!: string[];
}

export class OriginalsSynchronizationResult {
  linked!: number;
  alreadyLinked!: number;
  ambiguous!: string[];
}

export class ActivityUser {
  name!: string;
}

export class BackofficeActivity {
  id!: string;
  userId!: string | null;
  user!: ActivityUser | null;
  action!: string;
  entity!: string;
  @JsonObject({ nullable: true }) details!: Prisma.JsonValue;
  createdAt!: Date;
}

export class BackofficeActivityPage {
  items!: BackofficeActivity[];
  total!: number;
  page!: number;
  pageSize!: number;
}

export class StaffUser {
  id!: string;
  name!: string;
  login!: string;
  role!: UserRole;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class StaffUserWithSessions extends StaffUser {
  twoFactorEnabled!: boolean;
  activeSessionCount!: number;
}

export class StaffSession {
  id!: string;
  application!: string;
  createdAt!: Date;
  expiresAt!: Date;
}

export class RevokedSessions {
  revoked!: number;
}

export class RevokedSession {
  revoked!: boolean;
}

export class ProductCategoryReference {
  id!: string;
  name!: string;
  slug!: string;
}

export class BackofficeProduct {
  id!: string;
  sku!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  shortDescription!: string | null;
  /** Decimal as a string, e.g. "12500.00". */
  price!: string;
  pistonDiameterMm!: number | null;
  rodDiameterMm!: number | null;
  strokeMm!: number | null;
  collapsedLengthMm!: number | null;
  maxPressureMpa!: string | null;
  nominalPressureMpa!: string | null;
  stockQuantity!: number;
  isActive!: boolean;
  isFeatured!: boolean;
  imagePath!: string | null;
  categoryId!: string;
  category!: ProductCategoryReference;
  /** The version for `expectedUpdatedAt` of the next edit. */
  updatedAt!: string;
}

export class BackofficeProductPage {
  items!: BackofficeProduct[];
  total!: number;
  page!: number;
  pageSize!: number;
}

/** `idsOnly=true`: every id that matches the table filters (bulk selection). */
export class IdList {
  ids!: string[];
}

export class Category {
  id!: string;
  legacyId!: number | null;
  name!: string;
  slug!: string;
  description!: string | null;
  parentId!: string | null;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CategoryParent {
  id!: string;
  name!: string;
}

export class BackofficeCategory extends Category {
  parent!: CategoryParent | null;
  productCount!: number;
}

export class BackofficeCategoryPage {
  items!: BackofficeCategory[];
  total!: number;
  page!: number;
  pageSize!: number;
}

export class UpdatedCount {
  updated!: number;
}

export class DeletedCount {
  deleted!: number;
}

export class ProductImage {
  imageKey!: string;
  imagePath!: string;
}

export class CatalogSettings {
  lowStockThreshold!: number;
  showOutOfStock!: boolean;
  showPrices!: boolean;
}
