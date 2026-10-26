import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerActivityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail, normalizePhone } from './customer-normalization';
import { AnonymizeCustomerDto } from './dto/anonymize-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerRequestsQueryDto } from './dto/customer-requests-query.dto';
import { MergeCustomerDto, MergeValueSource } from './dto/merge-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

function cleanText(value: string | null | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

type CustomerContact = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string;
  normalizedPhone: string | null;
  email: string | null;
  normalizedEmail: string | null;
  company: string | null;
  anonymizedAt: Date | null;
};

type ContactChange = { from: string | null; to: string | null };
type AnonymizationResult = { anonymizedAt: Date; requestsAnonymized: number };
const customerListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  email: true,
  company: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true,
  lastRequestAt: true,
} satisfies Prisma.CustomerSelect;
type CustomerListItem = Prisma.CustomerGetPayload<{ select: typeof customerListSelect }>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomers(query: CustomerQueryDto) {
    const search = cleanText(query.search);
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { middleName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
            {
              requests: {
                some: {
                  OR: [
                    { phone: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {};
    let customersPromise: Promise<CustomerListItem[]>;
    if (query.sortBy === 'lastActivity') {
      customersPromise = this.getCustomersByLastActivity(search, query);
    } else {
      customersPromise = this.prisma.customer.findMany({
        where,
        select: customerListSelect,
        orderBy: this.getCustomerOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    }
    const [customers, total] = await Promise.all([
      customersPromise,
      this.prisma.customer.count({ where }),
    ]);

    const requestCounts = await this.requestCounts(customers.map((customer) => customer.id));
    return {
      data: customers.map(({ lastRequestAt, ...customer }) => ({
        ...customer,
        requestCount: requestCounts.get(customer.id) ?? 0,
        lastActivity: lastRequestAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getCustomer(id: string, query: CustomerRequestsQueryDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        normalizedPhone: true,
        email: true,
        normalizedEmail: true,
        company: true,
        anonymizedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!customer) throw new NotFoundException('Клиент не найден.');

    const where: Prisma.RequestWhereInput = { customerId: id };
    const [requests, total, activities, potentialDuplicates, consents] = await Promise.all([
      this.prisma.request.findMany({
        where,
        select: {
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
          createdAt: true,
          updatedAt: true,
        },
        orderBy: this.getCustomerRequestOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.request.count({ where }),
      this.prisma.customerActivity.findMany({
        where: { customerId: id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.findPotentialDuplicates(customer),
      this.prisma.consent.findMany({
        where: { request: { customerId: id } },
        select: {
          id: true,
          type: true,
          documentVersion: true,
          documentHash: true,
          source: true,
          acceptedAt: true,
          request: { select: { id: true, number: true, type: true } },
        },
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);

    return {
      ...customer,
      requestCount: total,
      requests,
      activities,
      potentialDuplicates,
      consents,
      requestsPagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Saves the card only if it is still the version the manager opened
   * (`expectedUpdatedAt`); a concurrent edit, merge or anonymization answers 409.
   */
  async updateCustomer(id: string, dto: UpdateCustomerDto, userId: string) {
    const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
    const current = await this.getCustomerContact(id);
    if (current.anonymizedAt)
      throw new BadRequestException('Обезличенную карточку нельзя редактировать.');
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw customerChanged();
    const next = this.contactFromDto(current, dto);
    await this.assertPhoneAvailable(next.normalizedPhone, id);
    const changes = this.getContactChanges(current, next);
    if (Object.keys(changes).length === 0)
      return this.getCustomer(id, new CustomerRequestsQueryDto());

    try {
      await this.prisma.$transaction(async (tx) => {
        // Waits for a running merge or anonymization of this card, then fails the CAS below.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const updated = await tx.customer.updateMany({
          where: { id, updatedAt: expectedUpdatedAt, anonymizedAt: null },
          data: next,
        });
        if (updated.count !== 1) throw customerChanged();
        await tx.customerActivity.create({
          data: {
            customerId: id,
            userId,
            type: CustomerActivityType.UPDATED,
            data: { changes, source: 'crm' },
          },
        });
      });
    } catch (error) {
      this.rethrowIdentityConflict(error);
    }
    return this.getCustomer(id, new CustomerRequestsQueryDto());
  }

  async mergeCustomer(id: string, dto: MergeCustomerDto, userId: string) {
    if (id === dto.sourceCustomerId)
      throw new BadRequestException('Нельзя объединить клиента с ним самим.');
    try {
      await this.prisma.$transaction(async (tx) => {
        // Same per-customer lock as anonymization; sorted to avoid deadlocks
        // between two merges of the same pair in opposite directions.
        for (const lockedId of [id, dto.sourceCustomerId].sort())
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockedId}))`;
        // Contacts are read under the locks, so the merged card is built from
        // the latest values and cannot overwrite an edit saved meanwhile.
        const target = await this.getCustomerContact(id, tx);
        const source = await this.getCustomerContact(dto.sourceCustomerId, tx);
        if (target.anonymizedAt || source.anonymizedAt)
          throw new BadRequestException('Обезличенные карточки нельзя объединять.');
        const { contact: targetContact, selections } = this.resolveMergedContact(
          target,
          source,
          dto,
        );
        const sourceName = this.customerName(source);
        await tx.request.updateMany({
          where: { customerId: source.id },
          data: { customerId: target.id },
        });
        await tx.customerActivity.updateMany({
          where: { customerId: source.id },
          data: { customerId: target.id },
        });
        await tx.customer.delete({ where: { id: source.id } });
        await tx.customer.update({
          where: { id: target.id },
          data: targetContact,
        });
        await tx.customerActivity.create({
          data: {
            customerId: target.id,
            userId,
            type: CustomerActivityType.MERGED,
            data: {
              sourceCustomerId: source.id,
              sourceName,
              sourceContact: this.contactSnapshot(source),
              targetContactBefore: this.contactSnapshot(target),
              mergedContact: this.contactSnapshot(targetContact),
              selections,
            },
          },
        });
      });
    } catch (error) {
      this.rethrowIdentityConflict(error);
    }
    return this.getCustomer(id, new CustomerRequestsQueryDto());
  }

  async getCustomerPersonalData(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        email: true,
        company: true,
        anonymizedAt: true,
        createdAt: true,
        updatedAt: true,
        activities: {
          select: { type: true, data: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        requests: {
          orderBy: { createdAt: 'asc' },
          select: {
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
            comment: true,
            createdAt: true,
            updatedAt: true,
            cartRequest: {
              select: {
                subtotal: true,
                deliveryType: true,
                paymentType: true,
                deliveryAddress: true,
                deliveryAddressDetails: true,
                items: {
                  select: {
                    productName: true,
                    sku: true,
                    price: true,
                    quantity: true,
                    total: true,
                  },
                },
              },
            },
            customRequest: true,
            wholesaleRequest: true,
            comments: {
              select: { text: true, createdAt: true, updatedAt: true },
              orderBy: { createdAt: 'asc' },
            },
            activities: {
              select: { type: true, data: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
            consents: {
              select: {
                type: true,
                documentVersion: true,
                documentHash: true,
                source: true,
                acceptedAt: true,
              },
              orderBy: { acceptedAt: 'asc' },
            },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Клиент не найден.');
    return { exportedAt: new Date(), customer };
  }

  async anonymizeCustomer(id: string, dto: AnonymizeCustomerDto, userId: string) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Укажите основание для обезличивания.');
    const result = await this.prisma.$transaction(async (tx) => {
      const anonymized = await this.anonymizeCustomerInTransaction(tx, id, reason, userId);
      if (!anonymized) throw new ConflictException('Клиент больше не подходит под политику.');
      return anonymized;
    });
    return { ok: true, ...result };
  }

  async anonymizeCustomerByRetention(id: string, cutoff: Date): Promise<boolean> {
    const result = await this.prisma.$transaction((tx) =>
      this.anonymizeCustomerInTransaction(
        tx,
        id,
        `Автоматическая политика хранения: нет активных или обновлённых заявок после ${cutoff.toISOString()}.`,
        null,
        cutoff,
      ),
    );
    return result !== null;
  }

  private async anonymizeCustomerInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    reason: string,
    userId: string | null,
    retentionCutoff?: Date,
  ): Promise<AnonymizationResult | null> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const customer = await tx.customer.findUnique({
      where: { id },
      select: {
        id: true,
        anonymizedAt: true,
        updatedAt: true,
        requests: { select: { status: true, updatedAt: true } },
      },
    });
    if (!customer) {
      if (retentionCutoff) return null;
      throw new NotFoundException('Клиент не найден.');
    }
    if (customer.anonymizedAt) {
      if (retentionCutoff) return null;
      throw new ConflictException('Персональные данные клиента уже обезличены.');
    }
    if (
      retentionCutoff &&
      (customer.updatedAt > retentionCutoff ||
        customer.requests.some(
          (request) =>
            request.updatedAt > retentionCutoff ||
            (request.status !== 'COMPLETED' && request.status !== 'CANCELLED'),
        ))
    ) {
      return null;
    }

    const requests = await tx.request.findMany({
      where: { customerId: id },
      select: { id: true },
    });
    const requestIds = requests.map((request) => request.id);
    const anonymizedAt = new Date();

    if (requestIds.length > 0) {
      await tx.publicRequestSubmission.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.requestComment.updateMany({
        where: { requestId: { in: requestIds } },
        data: { text: 'Комментарий удалён при обезличивании персональных данных.' },
      });
      await tx.requestActivity.updateMany({
        where: { requestId: { in: requestIds }, type: 'COMMENT_ADDED' },
        data: { data: { redacted: true } },
      });
      await tx.cartRequest.updateMany({
        where: { requestId: { in: requestIds } },
        data: { deliveryAddress: null, deliveryAddressDetails: Prisma.DbNull },
      });
      await tx.customRequest.updateMany({
        where: { requestId: { in: requestIds } },
        data: { technicalComment: null },
      });
      await tx.wholesaleRequest.updateMany({
        where: { requestId: { in: requestIds } },
        data: { message: null },
      });
      await tx.request.updateMany({
        where: { id: { in: requestIds } },
        data: {
          firstName: 'Удалено',
          lastName: 'Удалено',
          middleName: null,
          phone: 'Удалено',
          email: null,
          company: null,
          comment: null,
        },
      });
    }

    await tx.customerActivity.updateMany({
      where: { customerId: id },
      data: { data: { redacted: true } },
    });
    await tx.customer.update({
      where: { id },
      data: {
        firstName: 'Обезличенный',
        lastName: 'клиент',
        middleName: null,
        phone: 'Удалено',
        normalizedPhone: null,
        email: null,
        normalizedEmail: null,
        company: null,
        anonymizedAt,
      },
    });
    await tx.customerActivity.create({
      data: {
        customerId: id,
        userId,
        type: CustomerActivityType.ANONYMIZED,
        data: {
          reason,
          requestsAnonymized: requestIds.length,
          ...(retentionCutoff ? { automated: true, cutoff: retentionCutoff.toISOString() } : {}),
        },
      },
    });
    return { anonymizedAt, requestsAnonymized: requestIds.length };
  }

  private async findPotentialDuplicates(customer: CustomerContact) {
    const conditions: Prisma.CustomerWhereInput[] = [];
    if (customer.normalizedPhone) conditions.push({ normalizedPhone: customer.normalizedPhone });
    if (customer.normalizedEmail) conditions.push({ normalizedEmail: customer.normalizedEmail });
    if (conditions.length === 0) return [];
    const duplicates = await this.prisma.customer.findMany({
      where: { id: { not: customer.id }, OR: conditions },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        email: true,
        company: true,
        anonymizedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    const requestCounts = await this.requestCounts(duplicates.map((duplicate) => duplicate.id));
    return duplicates.map((duplicate) => ({
      ...duplicate,
      requestCount: requestCounts.get(duplicate.id) ?? 0,
    }));
  }

  /**
   * Request counts of the given customers only. Prisma's `_count` in a list
   * joins a GROUP BY over the whole "Request" table for every page (PERF-01).
   */
  private async requestCounts(customerIds: string[]) {
    if (!customerIds.length) return new Map<string, number>();
    const rows = await this.prisma.request.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.customerId ?? '', row._count._all]));
  }

  private async getCustomerContact(
    id: string,
    client: Pick<Prisma.TransactionClient, 'customer'> = this.prisma,
  ): Promise<CustomerContact & { updatedAt: Date }> {
    const customer = await client.customer.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        normalizedPhone: true,
        email: true,
        normalizedEmail: true,
        company: true,
        anonymizedAt: true,
        updatedAt: true,
      },
    });
    if (!customer) throw new NotFoundException('Клиент не найден.');
    return customer;
  }

  private async assertPhoneAvailable(normalizedPhone: string, customerId: string) {
    const duplicate = await this.prisma.customer.findFirst({
      where: { id: { not: customerId }, normalizedPhone },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException(
        'Телефон уже указан у другого клиента. Объедините дубликаты вручную.',
      );
  }

  private contactFromDto(current: CustomerContact, dto: UpdateCustomerDto) {
    const normalizedPhone = normalizePhone(dto.phone);
    if (!normalizedPhone)
      throw new BadRequestException('Введите корректный российский номер телефона.');
    return {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      middleName:
        dto.middleName === undefined ? current.middleName : (cleanText(dto.middleName) ?? null),
      phone: dto.phone.trim(),
      normalizedPhone,
      email: dto.email === undefined ? current.email : (normalizeEmail(dto.email) ?? null),
      normalizedEmail:
        dto.email === undefined ? current.normalizedEmail : (normalizeEmail(dto.email) ?? null),
      company: dto.company === undefined ? current.company : (cleanText(dto.company) ?? null),
    };
  }

  private resolveMergedContact(
    target: CustomerContact,
    source: CustomerContact,
    dto: MergeCustomerDto,
  ) {
    const selections = {
      firstName: this.resolveMergeSelection(
        target.firstName,
        source.firstName,
        dto.firstNameSelection,
        'Имя',
      ),
      lastName: this.resolveMergeSelection(
        target.lastName,
        source.lastName,
        dto.lastNameSelection,
        'Фамилия',
      ),
      middleName: this.resolveMergeSelection(
        target.middleName,
        source.middleName,
        dto.middleNameSelection,
        'Отчество',
      ),
      phone: this.resolveMergeSelection(
        target.normalizedPhone ?? target.phone,
        source.normalizedPhone ?? source.phone,
        dto.phoneSelection,
        'Телефон',
      ),
      email: this.resolveMergeSelection(
        target.normalizedEmail ?? target.email,
        source.normalizedEmail ?? source.email,
        dto.emailSelection,
        'Почта',
      ),
      company: this.resolveMergeSelection(
        target.company,
        source.company,
        dto.companySelection,
        'Компания',
      ),
    };

    return {
      contact: {
        firstName: this.selectedValue(selections.firstName, target.firstName, source.firstName),
        lastName: this.selectedValue(selections.lastName, target.lastName, source.lastName),
        middleName: this.selectedValue(selections.middleName, target.middleName, source.middleName),
        phone: this.selectedValue(selections.phone, target.phone, source.phone),
        normalizedPhone: this.selectedValue(
          selections.phone,
          target.normalizedPhone,
          source.normalizedPhone,
        ),
        email: this.selectedValue(selections.email, target.email, source.email),
        normalizedEmail: this.selectedValue(
          selections.email,
          target.normalizedEmail,
          source.normalizedEmail,
        ),
        company: this.selectedValue(selections.company, target.company, source.company),
      },
      selections,
    };
  }

  private resolveMergeSelection(
    targetValue: string | null,
    sourceValue: string | null,
    requestedSelection: MergeValueSource | undefined,
    label: string,
  ): MergeValueSource {
    const normalizedTarget = cleanText(targetValue)?.toLocaleLowerCase('ru-RU');
    const normalizedSource = cleanText(sourceValue)?.toLocaleLowerCase('ru-RU');

    if (!normalizedTarget) return MergeValueSource.SOURCE;
    if (!normalizedSource || normalizedTarget === normalizedSource) return MergeValueSource.TARGET;
    if (!requestedSelection) {
      throw new BadRequestException(`Выберите значение для поля «${label}».`);
    }
    return requestedSelection;
  }

  private selectedValue<T>(selection: MergeValueSource, targetValue: T, sourceValue: T): T {
    return selection === MergeValueSource.SOURCE ? sourceValue : targetValue;
  }

  private contactSnapshot(
    contact: Pick<
      CustomerContact,
      'firstName' | 'lastName' | 'middleName' | 'phone' | 'email' | 'company'
    >,
  ) {
    return {
      firstName: contact.firstName,
      lastName: contact.lastName,
      middleName: contact.middleName,
      phone: contact.phone,
      email: contact.email,
      company: contact.company,
    };
  }

  private getContactChanges(
    current: CustomerContact,
    next: Omit<CustomerContact, 'id' | 'anonymizedAt'>,
  ) {
    const changes: Record<string, ContactChange> = {};
    const labels: Record<
      keyof Omit<CustomerContact, 'id' | 'normalizedPhone' | 'normalizedEmail' | 'anonymizedAt'>,
      string
    > = {
      firstName: 'Имя',
      lastName: 'Фамилия',
      middleName: 'Отчество',
      phone: 'Телефон',
      email: 'Почта',
      company: 'Компания',
    };
    for (const [field, label] of Object.entries(labels) as [keyof typeof labels, string][]) {
      if (current[field] !== next[field])
        changes[label] = { from: current[field], to: next[field] };
    }
    return changes;
  }

  private customerName(customer: CustomerContact) {
    return [customer.lastName, customer.firstName, customer.middleName].filter(Boolean).join(' ');
  }

  private rethrowIdentityConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        'Телефон уже указан у другого клиента. Объедините дубликаты вручную.',
      );
    }
    throw error;
  }

  private getCustomerOrderBy(
    sortBy: Exclude<CustomerQueryDto['sortBy'], 'lastActivity'>,
    sortOrder: CustomerQueryDto['sortOrder'],
  ): Prisma.CustomerOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'name':
        return [{ lastName: sortOrder }, { firstName: sortOrder }];
      case 'company':
        return [{ company: { sort: sortOrder, nulls: 'last' } }];
      case 'phone':
        return [{ phone: sortOrder }];
      case 'email':
        return [{ email: { sort: sortOrder, nulls: 'last' } }];
      case 'requestCount':
        return [{ requests: { _count: sortOrder } }];
    }
  }

  private async getCustomersByLastActivity(
    search: string | undefined,
    query: CustomerQueryDto,
  ): Promise<CustomerListItem[]> {
    const searchPattern = search ? `%${search}%` : undefined;
    const searchCondition = searchPattern
      ? Prisma.sql`(
          c."firstName" ILIKE ${searchPattern}
          OR c."lastName" ILIKE ${searchPattern}
          OR c."middleName" ILIKE ${searchPattern}
          OR c."phone" ILIKE ${searchPattern}
          OR c."email" ILIKE ${searchPattern}
          OR c."company" ILIKE ${searchPattern}
          OR EXISTS (
            SELECT 1
            FROM "Request" search_request
            WHERE search_request."customerId" = c."id"
              AND (
                search_request."phone" ILIKE ${searchPattern}
                OR search_request."email" ILIKE ${searchPattern}
              )
          )
        )`
      : Prisma.sql`TRUE`;
    // Both directions follow "Customer_lastRequestAt_idx" (forwards or
    // backwards), so a page is read from the index instead of sorting every
    // customer (PERF-01). Customers without requests come last, or first
    // when the oldest activity is shown first.
    const order =
      query.sortOrder === 'asc'
        ? Prisma.sql`c."lastRequestAt" ASC NULLS FIRST, c."createdAt" ASC, c."id" DESC`
        : Prisma.sql`c."lastRequestAt" DESC NULLS LAST, c."createdAt" DESC, c."id" ASC`;
    const skip = (query.page - 1) * query.limit;
    const orderedIds = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c."id"
      FROM "Customer" c
      WHERE ${searchCondition}
      ORDER BY ${order}
      OFFSET ${skip}
      LIMIT ${query.limit}
    `);
    if (orderedIds.length === 0) return [];

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: orderedIds.map(({ id }) => id) } },
      select: customerListSelect,
    });
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    return orderedIds.flatMap(({ id }) => {
      const customer = customersById.get(id);
      return customer ? [customer] : [];
    });
  }

  private getCustomerRequestOrderBy(
    sortBy: CustomerRequestsQueryDto['sortBy'],
    sortOrder: CustomerRequestsQueryDto['sortOrder'],
  ): Prisma.RequestOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'number':
        return [{ sequence: sortOrder }];
      case 'type':
        return [{ type: sortOrder }];
      case 'status':
        return [{ status: sortOrder }];
      case 'createdAt':
        return [{ createdAt: sortOrder }];
    }
  }
}

function customerChanged() {
  return new ConflictException(
    'Карточка клиента уже изменена другим пользователем. Обновите данные и повторите изменения.',
  );
}
