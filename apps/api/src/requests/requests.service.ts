import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CustomerActivityType,
  Prisma,
  RequestActivityType,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { resolveCatalogImagePath } from '../catalog/catalog-image-path';
import { normalizeEmail, normalizePhone } from '../customers/customer-normalization';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCartRequestDto } from './dto/create-cart-request.dto';
import { CreateCustomRequestDto } from './dto/create-custom-request.dto';
import { CreateWholesaleRequestDto } from './dto/create-wholesale-request.dto';
import { CreateRequestCommentDto } from './dto/create-request-comment.dto';
import { RequestHistoryQueryDto } from './dto/request-history-query.dto';
import { RequestQueryDto } from './dto/request-query.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import {
  ActivePersonalDataDocument,
  getActivePersonalDataDocument,
} from './personal-data-document';

type ContactSnapshot = {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  company?: string;
  comment?: string;
};

type CreatedRequest = {
  id: string;
  number: string;
  createdAt: Date;
};

type PublicRequestReceipt = {
  number: string;
  createdAt: Date;
};

const requestListSelect = {
  id: true,
  number: true,
  type: true,
  status: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  email: true,
  company: true,
  responseDueAt: true,
  firstRespondedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RequestSelect;

const nextStatusByCurrent: Partial<Record<RequestStatus, RequestStatus>> = {
  [RequestStatus.NEW]: RequestStatus.IN_PROGRESS,
  [RequestStatus.IN_PROGRESS]: RequestStatus.CONTACTED,
  [RequestStatus.CONTACTED]: RequestStatus.COMPLETED,
};

const idempotencyDurationMs = 1000 * 60 * 60 * 24;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const defaultFirstResponseMinutes = 60;

function cleanText(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function normalizeIdentityText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
  return normalized || undefined;
}

type CustomerIdentityCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  normalizedEmail: string | null;
};

function isConfidentIdentityMatch(
  candidate: CustomerIdentityCandidate,
  input: ContactSnapshot,
  normalizedEmail: string | undefined,
) {
  const emailMatches = Boolean(normalizedEmail) && candidate.normalizedEmail === normalizedEmail;
  const firstNameMatches =
    normalizeIdentityText(candidate.firstName) === normalizeIdentityText(input.firstName);
  const lastNameMatches =
    normalizeIdentityText(candidate.lastName) === normalizeIdentityText(input.lastName);
  const candidateMiddleName = normalizeIdentityText(candidate.middleName);
  const inputMiddleName = normalizeIdentityText(input.middleName);
  const middleNameMatches =
    !candidateMiddleName || !inputMiddleName || candidateMiddleName === inputMiddleName;
  const fullNameMatches = firstNameMatches && lastNameMatches && middleNameMatches;

  // Phone + email or phone + full name is strong enough for automatic linking.
  // A company match alone is intentionally insufficient: shared switchboard
  // numbers are common, especially for wholesale requests.
  return emailMatches || fullNameMatches;
}

function cleanAddressDetails(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    ([, detail]) => typeof detail === 'string' && detail.trim().length > 0,
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCartRequest(dto: CreateCartRequestDto, idempotencyKey?: string) {
    const consentDocument = this.requireActiveConsentDocument(dto.documentVersion);
    return this.createPublicRequest('CART', idempotencyKey, dto, async (tx) => {
      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: {
          id: true,
          legacyId: true,
          name: true,
          sku: true,
          price: true,
        },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const missingProductIds = productIds.filter((id) => !productsById.has(id));

      if (missingProductIds.length > 0) {
        throw new BadRequestException('Один или несколько товаров не найдены или недоступны.');
      }

      const items = dto.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new BadRequestException('Товар не найден.');
        }

        const total = product.price.mul(item.quantity);
        return {
          productId: product.id,
          legacyId: product.legacyId,
          productName: product.name,
          sku: product.sku,
          price: product.price,
          quantity: item.quantity,
          total,
        };
      });
      const subtotal = items.reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0));
      const request = await this.createRequest(tx, 'CART', dto);
      await tx.cartRequest.create({
        data: {
          requestId: request.id,
          subtotal,
          deliveryType: dto.deliveryType,
          paymentType: dto.paymentType,
          deliveryAddress: cleanText(dto.deliveryAddress),
          deliveryAddressDetails: cleanAddressDetails(dto.deliveryAddressDetails),
          items: { create: items },
        },
      });
      await this.createConsentAndActivity(tx, request.id, consentDocument);
      return request;
    });
  }

  async createCustomRequest(dto: CreateCustomRequestDto, idempotencyKey?: string) {
    const consentDocument = this.requireActiveConsentDocument(dto.documentVersion);
    return this.createPublicRequest('CUSTOM', idempotencyKey, dto, async (tx) => {
      const request = await this.createRequest(tx, 'CUSTOM', dto);
      await tx.customRequest.create({
        data: { requestId: request.id },
      });
      await this.createConsentAndActivity(tx, request.id, consentDocument);
      return request;
    });
  }

  async createWholesaleRequest(dto: CreateWholesaleRequestDto, idempotencyKey?: string) {
    const consentDocument = this.requireActiveConsentDocument(dto.documentVersion);
    return this.createPublicRequest('WHOLESALE', idempotencyKey, dto, async (tx) => {
      const request = await this.createRequest(tx, 'WHOLESALE', dto);
      await tx.wholesaleRequest.create({
        data: { requestId: request.id },
      });
      await this.createConsentAndActivity(tx, request.id, consentDocument);
      return request;
    });
  }

  async getRequests(query: RequestQueryDto, userId: string) {
    const search = cleanText(query.search);
    const where: Prisma.RequestWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.attention === 'unread' ? { readStates: { none: { userId } } } : {}),
      ...(query.attention === 'overdue'
        ? {
            AND: [{ status: RequestStatus.NEW }, { responseDueAt: { lte: new Date() } }],
          }
        : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = this.getRequestOrderBy(query.sortBy, query.sortOrder);
    const [data, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        select: {
          ...requestListSelect,
          readStates: {
            where: { userId },
            select: { id: true },
          },
        },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      data: data.map(({ readStates, ...request }) =>
        this.withOperationalState(request, readStates.length === 0),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private getRequestOrderBy(
    sortBy: RequestQueryDto['sortBy'],
    sortOrder: RequestQueryDto['sortOrder'],
  ): Prisma.RequestOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'number':
        return [{ sequence: sortOrder }];
      case 'customer':
        return [{ lastName: sortOrder }, { firstName: sortOrder }];
      case 'type':
        return [{ type: sortOrder }];
      case 'phone':
        return [{ phone: sortOrder }];
      case 'company':
        return [{ company: { sort: sortOrder, nulls: 'last' } }];
      case 'status':
        return [{ status: sortOrder }];
      case 'createdAt':
        return [{ createdAt: sortOrder }];
    }
  }

  async updateRequestStatus(id: string, dto: UpdateRequestStatusDto, userId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!request) {
      throw new NotFoundException('Заявка не найдена.');
    }
    const nextStatus = nextStatusByCurrent[request.status];
    const canCancel =
      request.status !== RequestStatus.COMPLETED && request.status !== RequestStatus.CANCELLED;
    const isNextStatus = dto.status === nextStatus;
    const isCancellation = dto.status === RequestStatus.CANCELLED && canCancel;
    if (!isNextStatus && !isCancellation) {
      throw new BadRequestException(
        'Заявку можно перевести только на следующий этап или отменить.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.updateMany({
        where: { id, status: request.status },
        data: {
          status: dto.status,
          ...(request.status === RequestStatus.NEW && dto.status !== RequestStatus.CANCELLED
            ? { firstRespondedAt: new Date() }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Статус заявки уже изменён другим пользователем. Обновите страницу.',
        );
      }
      await tx.requestActivity.create({
        data: {
          requestId: id,
          userId,
          type: RequestActivityType.STATUS_CHANGED,
          data: { from: request.status, to: dto.status },
        },
      });
      await tx.requestReadState.deleteMany({ where: { requestId: id } });
      await tx.requestReadState.create({
        data: { requestId: id, userId },
      });
    });
    return this.getRequest(id, userId);
  }

  async createRequestComment(id: string, dto: CreateRequestCommentDto, userId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException('Заявка не найдена.');
    }
    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Комментарий не может быть пустым.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await tx.requestComment.create({
        data: { requestId: id, authorId: userId, text },
      });
      await tx.requestActivity.create({
        data: {
          requestId: id,
          userId,
          type: RequestActivityType.COMMENT_ADDED,
          data: { text },
        },
      });
      await tx.requestReadState.deleteMany({ where: { requestId: id } });
      await tx.requestReadState.create({
        data: { requestId: id, userId },
      });
    });
    return this.getRequest(id, userId);
  }

  async getRequest(
    id: string,
    userId: string,
    historyQuery: RequestHistoryQueryDto = new RequestHistoryQueryDto(),
  ) {
    const historyLimit = historyQuery.historyLimit;
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        customer: true,
        cartRequest: {
          include: {
            items: {
              include: {
                product: { select: { imageKey: true } },
              },
            },
          },
        },
        customRequest: true,
        wholesaleRequest: true,
        comments: {
          orderBy: { createdAt: 'desc' },
          skip: (historyQuery.commentsPage - 1) * historyLimit,
          take: historyLimit,
          include: { author: { select: { id: true, name: true } } },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          skip: (historyQuery.activitiesPage - 1) * historyLimit,
          take: historyLimit,
          include: { user: { select: { id: true, name: true } } },
        },
        consents: {
          orderBy: { acceptedAt: 'desc' },
          skip: (historyQuery.consentsPage - 1) * historyLimit,
          take: historyLimit,
        },
        _count: { select: { comments: true, activities: true, consents: true } },
        readStates: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Заявка не найдена.');
    }

    const { readStates, _count, ...details } = request;
    const cartRequest = details.cartRequest
      ? {
          ...details.cartRequest,
          items: details.cartRequest.items.map(({ product, ...item }) => ({
            ...item,
            imagePath: resolveCatalogImagePath(
              product?.imageKey ?? null,
              process.env.S3_PUBLIC_URL,
            ),
          })),
        }
      : null;
    return {
      ...this.withOperationalState({ ...details, cartRequest }, readStates.length === 0),
      historyPagination: {
        comments: this.historyPagination(historyQuery.commentsPage, historyLimit, _count.comments),
        activities: this.historyPagination(
          historyQuery.activitiesPage,
          historyLimit,
          _count.activities,
        ),
        consents: this.historyPagination(historyQuery.consentsPage, historyLimit, _count.consents),
      },
    };
  }

  async markRequestRead(id: string, userId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Заявка не найдена.');

    const state = await this.prisma.requestReadState.upsert({
      where: { requestId_userId: { requestId: id, userId } },
      create: { requestId: id, userId },
      update: { readAt: new Date() },
      select: { readAt: true },
    });
    return state;
  }

  async getStats(userId: string) {
    type StatsRow = {
      total: bigint | number;
      newRequests: bigint | number;
      cart: bigint | number;
      custom: bigint | number;
      wholesale: bigint | number;
      inProgress: bigint | number;
      contacted: bigint | number;
      completed: bigint | number;
      cancelled: bigint | number;
      unread: bigint | number;
      overdue: bigint | number;
    };
    const [stats] = await this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE request.status = 'NEW') AS "newRequests",
        COUNT(*) FILTER (WHERE request.type = 'CART') AS cart,
        COUNT(*) FILTER (WHERE request.type = 'CUSTOM') AS custom,
        COUNT(*) FILTER (WHERE request.type = 'WHOLESALE') AS wholesale,
        COUNT(*) FILTER (WHERE request.status = 'IN_PROGRESS') AS "inProgress",
        COUNT(*) FILTER (WHERE request.status = 'CONTACTED') AS contacted,
        COUNT(*) FILTER (WHERE request.status = 'COMPLETED') AS completed,
        COUNT(*) FILTER (WHERE request.status = 'CANCELLED') AS cancelled,
        -- A read mark is unique per (request, user) and cascades with the
        -- request, so unread = all requests - this user's read marks; one index
        -- range instead of a lookup per request (PERF-01).
        COUNT(*) - (
          SELECT COUNT(*) FROM "RequestReadState" read_state
          WHERE read_state."userId" = ${userId}
        ) AS unread,
        COUNT(*) FILTER (
          WHERE request.status = 'NEW'
            AND request."responseDueAt" <= CURRENT_TIMESTAMP
        ) AS overdue
      FROM "Request" request
    `);
    if (!stats) throw new Error('CRM dashboard aggregate returned no rows.');

    return {
      total: Number(stats.total),
      new: Number(stats.newRequests),
      cart: Number(stats.cart),
      custom: Number(stats.custom),
      wholesale: Number(stats.wholesale),
      inProgress: Number(stats.inProgress),
      contacted: Number(stats.contacted),
      completed: Number(stats.completed),
      cancelled: Number(stats.cancelled),
      unread: Number(stats.unread),
      overdue: Number(stats.overdue),
    };
  }

  private historyPagination(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  private async createRequest(
    tx: Prisma.TransactionClient,
    type: RequestType,
    input: ContactSnapshot,
  ): Promise<CreatedRequest> {
    const customer = await this.findOrCreateCustomer(tx, input);
    const request = await tx.request.create({
      data: {
        type,
        customerId: customer.id,
        responseDueAt: new Date(Date.now() + this.firstResponseMinutes() * 60_000),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        middleName: cleanText(input.middleName),
        phone: input.phone.trim(),
        email: cleanText(input.email),
        company: cleanText(input.company),
        comment: cleanText(input.comment),
      },
      select: { id: true, sequence: true },
    });
    const numberedRequest = await tx.request.update({
      where: { id: request.id },
      data: { number: String(request.sequence) },
      select: { id: true, number: true, createdAt: true },
    });

    await tx.customerActivity.create({
      data: {
        customerId: customer.id,
        type: CustomerActivityType.REQUEST_ATTACHED,
        data: {
          requestId: numberedRequest.id,
          requestNumber: numberedRequest.number,
        },
      },
    });

    return numberedRequest;
  }

  private firstResponseMinutes() {
    const configured = process.env.REQUEST_FIRST_RESPONSE_MINUTES;
    if (!configured) return defaultFirstResponseMinutes;
    const minutes = Number(configured);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10_080) {
      throw new Error('REQUEST_FIRST_RESPONSE_MINUTES must be an integer between 1 and 10080.');
    }
    return minutes;
  }

  private withOperationalState<
    T extends {
      status: RequestStatus;
      responseDueAt: Date;
      createdAt: Date;
    },
  >(request: T, isUnread: boolean) {
    const now = Date.now();
    return {
      ...request,
      isUnread,
      isSlaOverdue: request.status === RequestStatus.NEW && request.responseDueAt.getTime() <= now,
      ageMinutes: Math.max(0, Math.floor((now - request.createdAt.getTime()) / 60_000)),
    };
  }

  private publicReceipt(request: CreatedRequest): PublicRequestReceipt {
    return {
      number: request.number,
      createdAt: request.createdAt,
    };
  }

  /**
   * Receipt of an earlier submission with the same Idempotency-Key and
   * payload, or null. The controller checks it before the one-time CAPTCHA,
   * so a retry after a lost response gets the original receipt.
   */
  findPublicReceipt(type: RequestType, idempotencyKey: string | undefined, payload: unknown) {
    return this.findIdempotentReceipt(this.idempotency(type, idempotencyKey, payload));
  }

  private async createPublicRequest(
    type: RequestType,
    idempotencyKey: string | undefined,
    payload: unknown,
    create: (tx: Prisma.TransactionClient) => Promise<CreatedRequest>,
  ): Promise<PublicRequestReceipt> {
    const idempotency = this.idempotency(type, idempotencyKey, payload);
    const existing = await this.findIdempotentReceipt(idempotency);
    if (existing) return existing;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const request = await create(tx);
        await tx.publicRequestSubmission.create({
          data: {
            keyHash: idempotency.keyHash,
            payloadHash: idempotency.payloadHash,
            requestId: request.id,
            expiresAt: new Date(Date.now() + idempotencyDurationMs),
          },
        });
        return request;
      });
      return this.publicReceipt(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.findIdempotentReceipt(idempotency);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private idempotency(type: RequestType, key: string | undefined, payload: unknown) {
    if (!key || !idempotencyKeyPattern.test(key)) {
      throw new BadRequestException('Передайте корректный заголовок Idempotency-Key.');
    }
    return {
      keyHash: hash(key),
      // The CAPTCHA payload is single-use and changes between attempts; it is
      // not part of the request itself.
      payloadHash: hash(`${type}:${stableStringify(withoutCaptcha(payload))}`),
    };
  }

  private async findIdempotentReceipt(idempotency: {
    keyHash: string;
    payloadHash: string;
  }): Promise<PublicRequestReceipt | null> {
    await this.prisma.publicRequestSubmission.deleteMany({
      where: {
        keyHash: idempotency.keyHash,
        expiresAt: { lte: new Date() },
      },
    });
    const existing = await this.prisma.publicRequestSubmission.findUnique({
      where: { keyHash: idempotency.keyHash },
      select: {
        payloadHash: true,
        request: { select: { number: true, createdAt: true } },
      },
    });
    if (!existing) return null;
    if (existing.payloadHash !== idempotency.payloadHash) {
      throw new ConflictException('Этот Idempotency-Key уже использован для другой заявки.');
    }
    return existing.request;
  }

  private async findOrCreateCustomer(tx: Prisma.TransactionClient, input: ContactSnapshot) {
    const phone = input.phone.trim();
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new BadRequestException('Введите корректный российский номер телефона.');
    }
    const email = normalizeEmail(input.email);
    const identityKey = `customer:phone:${normalizedPhone}`;
    // The function returns PostgreSQL's pseudo-type `void`. `$queryRaw`
    // attempts to deserialize it and fails with Prisma's pg adapter, while
    // `$executeRaw` correctly waits for the lock without reading the column.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identityKey}))`;

    const phoneCustomers = await tx.customer.findMany({
      where: { normalizedPhone },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        normalizedEmail: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 21,
    });
    const confidentMatches = phoneCustomers.filter((candidate) =>
      isConfidentIdentityMatch(candidate, input, email),
    );
    if (confidentMatches.length === 1) {
      return { id: confidentMatches[0].id };
    }

    const created = await tx.customer.create({
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        middleName: cleanText(input.middleName),
        phone,
        normalizedPhone,
        email,
        normalizedEmail: email,
        company: cleanText(input.company),
      },
    });
    await tx.customerActivity.create({
      data: {
        customerId: created.id,
        type: CustomerActivityType.CREATED,
        data: {
          source: 'request',
          identityResolution: phoneCustomers.length === 0 ? 'NEW_CONTACT' : 'POTENTIAL_DUPLICATE',
          potentialDuplicateCustomerIds: phoneCustomers.map((candidate) => candidate.id),
        },
      },
    });
    return created;
  }

  private async createConsentAndActivity(
    tx: Prisma.TransactionClient,
    requestId: string,
    document: ActivePersonalDataDocument,
  ) {
    await tx.consent.create({
      data: {
        requestId,
        type: 'PERSONAL_DATA',
        documentVersion: document.version,
        documentHash: document.hash,
        source: 'WEB_FORM',
      },
    });
    await tx.requestActivity.create({
      data: { requestId, type: RequestActivityType.REQUEST_CREATED },
    });
  }

  private requireActiveConsentDocument(clientVersion: string) {
    const activeDocument = getActivePersonalDataDocument();
    if (clientVersion.trim() !== activeDocument.version) {
      throw new PreconditionFailedException(
        'Документы обработки персональных данных обновились. Обновите страницу и подтвердите согласие повторно.',
      );
    }
    return activeDocument;
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function withoutCaptcha(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || !('altcha' in payload)) return payload;
  const rest: Record<string, unknown> = { ...payload };
  delete rest.altcha;
  return rest;
}
