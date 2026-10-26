import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { twoFactorAccountKey } from '../auth/auth.service';
import { hashPassword } from '../auth/password-hash';
import { resolveCatalogImagePath } from '../catalog/catalog-image-path';
import {
  AUDIT_ITEMS_LIMIT,
  auditChanges,
  auditItems,
  categoryAuditValues,
  compactValues,
  productAuditValues,
  recordBackofficeActivity,
  userAuditValues,
} from './backoffice-audit';
import { enqueueStorageCleanup, productFiles } from './storage-cleanup';
import {
  BulkProductUpdateDto,
  CategoryDto,
  CategoryTableQueryDto,
  CreateUserDto,
  ProductDto,
  ProductTableQueryDto,
  SettingsDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateUserDto,
  MAX_STOCK,
} from './dto/catalog.dto';
import type { BackofficeProduct } from './backoffice.response';

type Tx = Prisma.TransactionClient;

/** Product audit rows use the same order as the Back Office tables. */
const productAuditSelect = { id: true, sku: true, name: true, stockQuantity: true } as const;
const categoryAuditInclude = { parent: { select: { name: true } } } as const;
const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
} as const;
const managedUserSelect = {
  id: true,
  name: true,
  login: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
@Injectable()
export class BackofficeService {
  constructor(private readonly prisma: PrismaService) {}
  async users() {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        ...managedUserSelect,
        twoFactorEnabled: true,
        _count: {
          select: {
            sessions: {
              where: { expiresAt: { gt: now }, twoFactorVerified: true },
            },
          },
        },
      },
    });
    return users.map(({ _count, ...user }) => ({
      ...user,
      activeSessionCount: _count.sessions,
    }));
  }
  /**
   * Every mutation below writes its journal entry in the same transaction, so a
   * failed audit write rolls the change back instead of leaving a gap in the log.
   */
  async createUser(dto: CreateUserDto, actorId: string) {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: dto.name.trim(),
            login: dto.login.trim().toLowerCase(),
            passwordHash,
            role: dto.role,
          },
          select: managedUserSelect,
        });
        await recordBackofficeActivity(tx, actorId, 'USER_CREATED', 'user', {
          id: user.id,
          name: user.name,
          login: user.login,
          role: user.role,
          isActive: user.isActive,
          values: userAuditValues(user),
        });
        return user;
      });
    } catch (error) {
      this.userUniqueError(error);
      throw error;
    }
  }
  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    if (id === actorId && (dto.isActive === false || (dto.role && dto.role !== 'ADMIN')))
      throw new ConflictException('Нельзя отключить или понизить собственную учётную запись.');
    const removesAdministrator = dto.isActive === false || dto.role === 'MANAGER';
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Two concurrent demotions must not both see the other administrator as active.
        if (removesAdministrator)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('active-administrators'))`;
        const before = await tx.user.findUnique({ where: { id }, select: managedUserSelect });
        if (!before) throw new NotFoundException('Пользователь не найден.');
        if (before.role === 'ADMIN' && before.isActive && removesAdministrator)
          await this.assertAnotherActiveAdmin(tx, id);
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
            ...(dto.login === undefined ? {} : { login: dto.login.trim().toLowerCase() }),
            ...(dto.role === undefined ? {} : { role: dto.role }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          },
          select: managedUserSelect,
        });
        await recordBackofficeActivity(tx, actorId, 'USER_UPDATED', 'user', {
          id,
          name: user.name,
          login: user.login,
          changes: auditChanges(userAuditValues(before), userAuditValues(user)),
        });
        return user;
      });
    } catch (error) {
      this.userUniqueError(error);
      throw error;
    }
  }
  async updateUserPassword(id: string, password: string, actorId: string) {
    const passwordHash = await hashPassword(password);
    return this.prisma.$transaction(async (tx) => {
      const target = await this.userAuditTarget(tx, id);
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.authSession.deleteMany({ where: { userId: id } });
      // A pending challenge was issued for the old password.
      await tx.authTwoFactorChallenge.deleteMany({ where: { userId: id } });
      // An administrator's reset also lifts a 2FA lock.
      await tx.loginAttempt.deleteMany({ where: { key: twoFactorAccountKey(id) } });
      await recordBackofficeActivity(tx, actorId, 'USER_PASSWORD_CHANGED', 'user', target);
      return { ok: true };
    });
  }
  async resetUserTwoFactor(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.userAuditTarget(tx, id);
      await tx.user.update({
        where: { id },
        data: {
          twoFactorSecret: null,
          twoFactorEnabled: false,
          twoFactorEnabledAt: null,
          lastTotpCounter: null,
        },
      });
      await tx.authSession.deleteMany({ where: { userId: id } });
      await tx.authRecoveryCode.deleteMany({ where: { userId: id } });
      await tx.authTwoFactorChallenge.deleteMany({ where: { userId: id } });
      await tx.loginAttempt.deleteMany({ where: { key: twoFactorAccountKey(id) } });
      await recordBackofficeActivity(tx, actorId, 'USER_TWO_FACTOR_RESET', 'user', target);
      return { ok: true };
    });
  }
  async revokeUserSessions(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.userAuditTarget(tx, id);
      const result = await tx.authSession.deleteMany({ where: { userId: id } });
      await recordBackofficeActivity(tx, actorId, 'USER_SESSIONS_REVOKED', 'user', {
        ...target,
        count: result.count,
      });
      return { revoked: result.count };
    });
  }
  async userSessions(userId: string) {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Пользователь не найден.');
    return this.prisma.authSession.findMany({
      where: { userId, expiresAt: { gt: new Date() }, twoFactorVerified: true },
      select: { id: true, application: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async revokeUserSession(userId: string, sessionId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.userAuditTarget(tx, userId);
      const session = await tx.authSession.findFirst({
        where: { id: sessionId, userId },
        select: { application: true },
      });
      if (!session) throw new NotFoundException('Активная сессия не найдена.');
      const result = await tx.authSession.deleteMany({ where: { id: sessionId, userId } });
      if (!result.count) throw new NotFoundException('Активная сессия не найдена.');
      await recordBackofficeActivity(tx, actorId, 'USER_SESSION_REVOKED', 'user', {
        ...target,
        application: session.application,
      });
      return { revoked: true };
    });
  }
  async products(query: ProductTableQueryDto = {}) {
    const requestedTablePage =
      query.page !== undefined ||
      query.pageSize !== undefined ||
      query.filters !== undefined ||
      query.sortBy !== undefined;
    const filters = this.productFilters(query.filters);
    if (query.idsOnly) {
      const rows = await this.prisma.product.findMany({
        where: filters,
        select: { id: true },
      });
      return { ids: rows.map((row) => row.id) };
    }
    const sortBy = query.sortBy ?? 'name';
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sortBy === 'category'
        ? { category: { name: query.sortDir ?? 'asc' } }
        : sortBy === 'stock'
          ? { stockQuantity: query.sortDir ?? 'asc' }
          : sortBy === 'active'
            ? { isActive: query.sortDir ?? 'asc' }
            : sortBy === 'price'
              ? { price: query.sortDir ?? 'asc' }
              : { [sortBy]: query.sortDir ?? 'asc' };
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const page = query.page ?? 0;
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        include: productInclude,
        where: filters,
        orderBy,
        ...(requestedTablePage ? { skip: page * pageSize, take: pageSize } : {}),
      }),
      this.prisma.product.count({ where: filters }),
    ]);
    const items = products.map((item) => this.product(item));
    return requestedTablePage ? { items, total, page, pageSize } : items;
  }
  async productById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Товар не найден.');
    return this.product(product);
  }
  async createProduct(dto: ProductDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertCategory(tx, dto.categoryId);
        const product = this.product(
          await tx.product.create({
            data: {
              ...this.productChanges(dto),
              sku: dto.sku,
              name: dto.name,
              categoryId: dto.categoryId,
              price: new Prisma.Decimal(dto.price),
              slug: dto.slug || this.slugify(dto.name),
            },
            include: productInclude,
          }),
        );
        await recordBackofficeActivity(tx, actorId, 'PRODUCT_CREATED', 'product', {
          id: product.id,
          name: product.name,
          sku: product.sku,
          values: productAuditValues(product),
        });
        return product;
      });
    } catch (error) {
      this.uniqueError(error);
      throw error;
    }
  }
  /**
   * Saves the edit form only if nobody changed the product since it was opened
   * (`expectedUpdatedAt`); otherwise answers 409 instead of silently overwriting.
   */
  async updateProduct(id: string, dto: UpdateProductDto, actorId: string) {
    const { expectedUpdatedAt, ...changes } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (changes.categoryId !== undefined) await this.assertCategory(tx, changes.categoryId);
        const current = await tx.product.findUnique({ where: { id }, include: productInclude });
        if (!current) throw new NotFoundException('Товар не найден.');
        const expected = new Date(expectedUpdatedAt);
        if (current.updatedAt.getTime() !== expected.getTime()) throw productChanged();
        const before = this.product(current);
        let updated;
        try {
          updated = await tx.product.update({
            // The version in the filter also catches a save that commits after the read above.
            where: { id, updatedAt: expected },
            // Only fields present in the request change; slug is kept unless sent explicitly.
            data: this.productChanges(changes),
            include: productInclude,
          });
        } catch (error) {
          if (this.isNotFound(error)) throw productChanged();
          throw error;
        }
        const product = this.product(updated);
        await recordBackofficeActivity(tx, actorId, 'PRODUCT_UPDATED', 'product', {
          id,
          name: product.name,
          sku: product.sku,
          changes: auditChanges(productAuditValues(before), productAuditValues(product)),
        });
        return product;
      });
    } catch (error) {
      this.uniqueError(error);
      throw error;
    }
  }
  /** Adds `delta` to the stock of one product; the result never drops below zero. */
  async adjustStock(id: string, delta: number, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [change] = await this.changeStock(tx, [id], delta);
      if (!change) throw new NotFoundException('Товар не найден.');
      const product = await tx.product.findUniqueOrThrow({
        where: { id },
        include: productInclude,
      });
      await recordBackofficeActivity(tx, actorId, 'STOCK_CHANGED', 'product', {
        id,
        name: change.name,
        sku: change.sku,
        changes: auditChanges(
          { stockQuantity: change.before },
          { stockQuantity: change.stockQuantity },
        ),
      });
      return this.product(product);
    });
  }
  async bulkStock(ids: string[], delta: number, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const changes = await this.changeStock(tx, ids, delta);
      await recordBackofficeActivity(tx, actorId, 'STOCK_BULK_CHANGED', 'product', {
        count: changes.length,
        delta,
        items: auditItems(this.byName(changes)),
        itemsTruncated: changes.length > AUDIT_ITEMS_LIMIT,
      });
      return { updated: changes.length };
    });
  }
  async bulkUpdateProducts(dto: BulkProductUpdateDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const category = dto.categoryId ? await this.assertCategory(tx, dto.categoryId) : null;
      const items = await tx.product.findMany({
        where: { id: { in: dto.ids } },
        select: productAuditSelect,
        orderBy: { name: 'asc' },
      });
      const data: Prisma.ProductUncheckedUpdateManyInput = {
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...(dto.isFeatured === undefined ? {} : { isFeatured: dto.isFeatured }),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      };
      const result = await tx.product.updateMany({ where: { id: { in: dto.ids } }, data });
      await recordBackofficeActivity(tx, actorId, 'PRODUCTS_BULK_UPDATED', 'product', {
        count: result.count,
        values: compactValues({
          isActive: dto.isActive,
          isFeatured: dto.isFeatured,
          category: category?.name,
        }),
        items: auditItems(items),
        itemsTruncated: items.length > AUDIT_ITEMS_LIMIT,
      });
      return { updated: result.count };
    });
  }
  async deleteProducts(ids: string[], actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { ...productAuditSelect, imageKey: true, imageOriginalKey: true },
        orderBy: { name: 'asc' },
      });
      const result = await tx.product.deleteMany({ where: { id: { in: ids } } });
      await recordBackofficeActivity(tx, actorId, 'PRODUCTS_DELETED', 'product', {
        count: result.count,
        items: auditItems(items),
        itemsTruncated: items.length > AUDIT_ITEMS_LIMIT,
      });
      // Queued in this transaction and removed by the caller after the commit.
      const files = productFiles(items);
      await enqueueStorageCleanup(tx, files, 'product deletion');
      return { deleted: result.count, files };
    });
  }
  /** Records a new product photo in the transaction that switches the image keys. */
  async recordProductImageUpdated(
    tx: Tx,
    productId: string,
    file: { mimetype: string; size: number },
    actorId: string,
  ) {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { name: true, sku: true },
    });
    await recordBackofficeActivity(tx, actorId, 'PRODUCT_IMAGE_UPDATED', 'product', {
      id: productId,
      name: product.name,
      sku: product.sku,
      contentType: file.mimetype,
      sizeBytes: file.size,
    });
  }
  async categories(query: CategoryTableQueryDto = {}) {
    const serverMode =
      query.page !== undefined ||
      query.pageSize !== undefined ||
      query.sortBy !== undefined ||
      query.filters !== undefined;
    const categoryFilters = this.categoryFilters(query.filters);
    let where = categoryFilters.where;
    if (categoryFilters.productCount !== undefined) {
      const productCounts = await this.prisma.product.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
      });
      const matchingCategoryIds = productCounts
        .filter((entry) => entry._count._all === categoryFilters.productCount)
        .map((entry) => entry.categoryId);
      const categoriesWithProducts = productCounts.map((entry) => entry.categoryId);
      where = {
        AND: [
          where,
          categoryFilters.productCount === 0
            ? { id: { notIn: categoriesWithProducts } }
            : { id: { in: matchingCategoryIds } },
        ],
      };
    }
    if (query.idsOnly) {
      const rows = await this.prisma.category.findMany({
        where,
        select: { id: true },
      });
      return { ids: rows.map((row) => row.id) };
    }
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const page = query.page ?? 0;
    const orderBy: Prisma.CategoryOrderByWithRelationInput =
      query.sortBy === 'productCount'
        ? { products: { _count: query.sortDir ?? 'asc' } }
        : query.sortBy === 'active'
          ? { isActive: query.sortDir ?? 'asc' }
          : { name: query.sortDir ?? 'asc' };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { products: true } },
        },
        where,
        orderBy,
        ...(serverMode ? { skip: page * pageSize, take: pageSize } : {}),
      }),
      this.prisma.category.count({ where }),
    ]);
    const items = rows.map(({ _count, ...item }) => ({
      ...item,
      productCount: _count.products,
    }));
    return serverMode ? { items, total, page, pageSize } : items;
  }
  async createCategory(dto: CategoryDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.parentId) {
          await this.lockCategoryTree(tx);
          await this.assertParent(tx, dto.parentId);
        }
        const category = await tx.category.create({ data: dto });
        const audited = await tx.category.findUniqueOrThrow({
          where: { id: category.id },
          include: categoryAuditInclude,
        });
        await recordBackofficeActivity(tx, actorId, 'CATEGORY_CREATED', 'category', {
          id: category.id,
          name: category.name,
          values: categoryAuditValues(audited),
        });
        return category;
      });
    } catch (error) {
      this.uniqueError(error);
      throw error;
    }
  }
  async updateCategory(id: string, dto: UpdateCategoryDto, actorId: string) {
    if (dto.parentId === id)
      throw new ConflictException('Категория не может быть родительской для самой себя.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.parentId) {
          await this.lockCategoryTree(tx);
          await this.assertParent(tx, dto.parentId, id);
        }
        const before = await tx.category.findUnique({
          where: { id },
          include: categoryAuditInclude,
        });
        if (!before) throw new NotFoundException('Категория не найдена.');
        const category = await tx.category.update({ where: { id }, data: dto });
        const after = await tx.category.findUniqueOrThrow({
          where: { id },
          include: categoryAuditInclude,
        });
        await recordBackofficeActivity(tx, actorId, 'CATEGORY_UPDATED', 'category', {
          id,
          name: category.name,
          changes: auditChanges(categoryAuditValues(before), categoryAuditValues(after)),
        });
        return category;
      });
    } catch (error) {
      this.notFoundOrUnique(error);
      throw error;
    }
  }
  async deleteCategories(ids: string[], actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCategoryTree(tx);
      const used = await tx.category.count({
        where: { id: { in: ids }, products: { some: {} } },
      });
      if (used) throw new ConflictException('Нельзя удалить категорию с товарами.');
      // The FK is ON DELETE SET NULL: deleting a parent alone would silently move its children to the root.
      const children = await tx.category.count({
        where: { parentId: { in: ids }, id: { notIn: ids } },
      });
      if (children)
        throw new ConflictException(
          'Нельзя удалить категорию с подкатегориями. Сначала перенесите или удалите их.',
        );
      const items = await this.categoryAuditItems(tx, ids);
      const result = await tx.category.deleteMany({
        where: { id: { in: ids } },
      });
      await recordBackofficeActivity(tx, actorId, 'CATEGORIES_DELETED', 'category', {
        count: result.count,
        items: auditItems(items),
        itemsTruncated: items.length > AUDIT_ITEMS_LIMIT,
      });
      return { deleted: result.count };
    });
  }
  async bulkUpdateCategories(ids: string[], isActive: boolean, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const items = await this.categoryAuditItems(tx, ids);
      const result = await tx.category.updateMany({
        where: { id: { in: ids } },
        data: { isActive },
      });
      await recordBackofficeActivity(tx, actorId, 'CATEGORIES_BULK_UPDATED', 'category', {
        count: result.count,
        values: { isActive },
        items: auditItems(items),
        itemsTruncated: items.length > AUDIT_ITEMS_LIMIT,
      });
      return { updated: result.count };
    });
  }
  async settings() {
    return this.prisma.catalogSettings.upsert({
      where: { id: 'catalog' },
      create: { id: 'catalog' },
      update: {},
      select: {
        lowStockThreshold: true,
        showOutOfStock: true,
        showPrices: true,
      },
    });
  }
  async updateSettings(dto: SettingsDto, actorId: string) {
    const select = { lowStockThreshold: true, showOutOfStock: true, showPrices: true } as const;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.catalogSettings.upsert({
        where: { id: 'catalog' },
        create: { id: 'catalog' },
        update: {},
        select,
      });
      const settings = await tx.catalogSettings.update({
        where: { id: 'catalog' },
        data: dto,
        select,
      });
      await recordBackofficeActivity(tx, actorId, 'SETTINGS_UPDATED', 'settings', {
        changes: auditChanges(before, settings),
      });
      return settings;
    });
  }
  /**
   * Adds `delta` in one UPDATE (clamped to 0…MAX_STOCK) after locking the rows,
   * so parallel changes add up instead of overwriting each other.
   */
  private async changeStock(tx: Tx, ids: string[], delta: number) {
    if (!ids.length) return [];
    const before = await tx.$queryRaw<
      Array<{ id: string; sku: string; name: string; stockQuantity: number }>
    >`
      SELECT "id", "sku", "name", "stockQuantity" FROM "Product"
      WHERE "id" IN (${Prisma.join(ids)})
      ORDER BY "id"
      FOR UPDATE
    `;
    if (!before.length) return [];
    const after = await tx.$queryRaw<Array<{ id: string; stockQuantity: number }>>`
      UPDATE "Product"
      SET "stockQuantity" = LEAST(${MAX_STOCK}, GREATEST(0, "stockQuantity" + ${delta})),
          "updatedAt" = (now() AT TIME ZONE 'UTC')::timestamp(3)
      WHERE "id" IN (${Prisma.join(before.map((row) => row.id))})
      RETURNING "id", "stockQuantity"
    `;
    const stockById = new Map(after.map((row) => [row.id, row.stockQuantity]));
    return before.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      before: row.stockQuantity,
      stockQuantity: stockById.get(row.id) ?? row.stockQuantity,
    }));
  }
  private byName<T extends { name: string }>(items: T[]) {
    return [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  private categoryAuditItems(tx: Tx, ids: string[]) {
    return tx.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  private async userAuditTarget(tx: Tx, id: string) {
    const user = await tx.user.findUnique({
      where: { id },
      select: { id: true, name: true, login: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден.');
    return user;
  }
  /** `undefined` leaves a column unchanged, `null` clears it. */
  private productChanges(dto: Omit<UpdateProductDto, 'expectedUpdatedAt'>) {
    const { price, maxPressureMpa, nominalPressureMpa, ...values } = dto;
    const decimal = (value: number | null) => (value === null ? null : new Prisma.Decimal(value));
    return {
      ...values,
      ...(price === undefined ? {} : { price: new Prisma.Decimal(price) }),
      ...(maxPressureMpa === undefined ? {} : { maxPressureMpa: decimal(maxPressureMpa) }),
      ...(nominalPressureMpa === undefined
        ? {}
        : { nominalPressureMpa: decimal(nominalPressureMpa) }),
    };
  }
  private productFilters(raw?: string): Prisma.ProductWhereInput {
    if (!raw) return {};
    try {
      const filters = JSON.parse(raw) as Array<{
        id?: string;
        value?: unknown;
        values?: unknown;
        min?: unknown;
        max?: unknown;
        mode?: string;
      }>;
      const and: Prisma.ProductWhereInput[] = [];
      filters.forEach(({ id, value, values, min, max, mode = 'contains' }) => {
        if (!id) return;
        const text =
          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : '';
        const selected = Array.isArray(values) ? values.map(String).filter(Boolean) : [];
        if (id === 'sku' || id === 'name') {
          if (!text) return;
          const condition =
            mode === 'equals'
              ? { equals: text, mode: 'insensitive' as const }
              : mode === 'startsWith'
                ? { startsWith: text, mode: 'insensitive' as const }
                : { contains: text, mode: 'insensitive' as const };
          and.push(mode === 'notContains' ? { NOT: { [id]: condition } } : { [id]: condition });
          return;
        }
        if (id === 'image') {
          if (!selected.length) return;
          const states: Prisma.ProductWhereInput[] = selected.map((item) =>
            item === 'none' ? { imageKey: null } : { imageKey: { not: null } },
          );
          and.push(mode === 'noneOf' ? { NOT: { OR: states } } : { OR: states });
          return;
        }
        if (id === 'category') {
          if (selected.length)
            and.push(
              mode === 'noneOf'
                ? { NOT: { categoryId: { in: selected } } }
                : { categoryId: { in: selected } },
            );
          return;
        }
        if (id === 'active') {
          if (selected.length === 1) {
            const flag = selected[0] === 'true';
            and.push(mode === 'noneOf' ? { isActive: !flag } : { isActive: flag });
          }
          return;
        }
        if (id === 'stock' || id === 'availability') {
          if (!selected.length) return;
          const states: Prisma.ProductWhereInput[] = selected.map((item) =>
            item === 'none'
              ? { stockQuantity: 0 }
              : item === 'low'
                ? { stockQuantity: { gt: 0, lte: 5 } }
                : { stockQuantity: { gt: 5 } },
          );
          and.push(mode === 'noneOf' ? { NOT: { OR: states } } : { OR: states });
          return;
        }
        if (id === 'price' || id === 'quantity') {
          const number = Number(text);
          const minValue = Number(min);
          const maxValue = Number(max);
          const field = id === 'price' ? 'price' : 'stockQuantity';
          const condition =
            mode === 'between'
              ? {
                  ...(Number.isFinite(minValue) ? { gte: minValue } : {}),
                  ...(Number.isFinite(maxValue) ? { lte: maxValue } : {}),
                }
              : mode === 'gt'
                ? { gt: number }
                : mode === 'gte'
                  ? { gte: number }
                  : mode === 'lt'
                    ? { lt: number }
                    : mode === 'lte'
                      ? { lte: number }
                      : { equals: number };
          if (
            (mode === 'between' && (Number.isFinite(minValue) || Number.isFinite(maxValue))) ||
            (mode !== 'between' && Number.isFinite(number))
          )
            and.push({ [field]: condition });
        }
      });
      return and.length ? { AND: and } : {};
    } catch {
      return {};
    }
  }
  private categoryFilters(raw?: string): {
    where: Prisma.CategoryWhereInput;
    productCount?: number;
  } {
    if (!raw) return { where: {} };
    try {
      const filters = JSON.parse(raw) as {
        name?: string;
        productCount?: string;
        active?: string;
      };
      const productCount = Number(filters.productCount);
      return {
        where: {
          ...(filters.name ? { name: { contains: filters.name, mode: 'insensitive' } } : {}),
          ...(filters.active ? { isActive: filters.active === 'true' } : {}),
        },
        ...(filters.productCount !== undefined &&
        filters.productCount !== '' &&
        Number.isSafeInteger(productCount) &&
        productCount >= 0
          ? { productCount }
          : {}),
      };
    } catch {
      return { where: {} };
    }
  }
  private slugify(value: string) {
    const translit: Record<string, string> = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'e',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'h',
      ц: 'ts',
      ч: 'ch',
      ш: 'sh',
      щ: 'sch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
    };
    return value
      .toLowerCase()
      .split('')
      .map((c) => translit[c] ?? c)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  private product(product: {
    price: { toString(): string };
    maxPressureMpa: { toString(): string } | null;
    nominalPressureMpa: { toString(): string } | null;
    category: { id: string; name: string; slug: string };
    id: string;
    sku: string;
    name: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    pistonDiameterMm: number | null;
    rodDiameterMm: number | null;
    strokeMm: number | null;
    collapsedLengthMm: number | null;
    imageKey: string | null;
    stockQuantity: number;
    isActive: boolean;
    isFeatured: boolean;
    categoryId: string;
    updatedAt: Date;
  }): BackofficeProduct {
    // Field by field: callers pass whole rows, whose other columns (legacyId,
    // the private original's key) are not part of the contract (ARCH-01).
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      price: product.price.toString(),
      pistonDiameterMm: product.pistonDiameterMm,
      rodDiameterMm: product.rodDiameterMm,
      strokeMm: product.strokeMm,
      collapsedLengthMm: product.collapsedLengthMm,
      maxPressureMpa: product.maxPressureMpa?.toString() ?? null,
      nominalPressureMpa: product.nominalPressureMpa?.toString() ?? null,
      stockQuantity: product.stockQuantity,
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      imagePath: resolveCatalogImagePath(product.imageKey, process.env.S3_PUBLIC_URL),
      categoryId: product.categoryId,
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },
      updatedAt: product.updatedAt.toISOString(),
    };
  }
  /** Serializes tree changes so that concurrent moves cannot build a cycle together. */
  private async lockCategoryTree(tx: Tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('category-tree'))`;
  }
  /** Checks that the parent exists and, when moving `categoryId`, is not one of its descendants. */
  private async assertParent(tx: Tx, parentId: string, categoryId?: string) {
    const visited = new Set<string>();
    let cursor: string | null = parentId;
    while (cursor && !visited.has(cursor)) {
      if (cursor === categoryId)
        throw new ConflictException('Нельзя вложить категорию в её собственную подкатегорию.');
      visited.add(cursor);
      const node: { parentId: string | null } | null = await tx.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!node) {
        if (cursor === parentId) throw new NotFoundException('Родительская категория не найдена.');
        break;
      }
      cursor = node.parentId;
    }
  }
  private async assertAnotherActiveAdmin(tx: Tx, excludedId: string) {
    const activeAdminCount = await tx.user.count({
      where: { id: { not: excludedId }, role: 'ADMIN', isActive: true },
    });
    if (!activeAdminCount)
      throw new ConflictException(
        'В системе должен оставаться хотя бы один активный администратор.',
      );
  }
  private async assertCategory(tx: Tx, categoryId: string) {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    if (!category) throw new NotFoundException('Категория не найдена.');
    return category;
  }
  private isNotFound(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }
  private uniqueError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException('Артикул или slug уже используются.');
  }
  private userUniqueError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException('Этот логин уже используется.');
  }
  private notFoundOrUnique(error: unknown) {
    if (this.isNotFound(error)) throw new NotFoundException('Запись не найдена.');
    this.uniqueError(error);
  }
}

function productChanged() {
  return new ConflictException(
    'Товар уже изменён другим пользователем. Обновите данные и повторите изменения.',
  );
}
