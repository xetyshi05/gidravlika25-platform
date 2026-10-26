import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { MergeValueSource } from './dto/merge-customer.dto';

describe('CustomersService personal data lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function anonymizationFixture(anonymizedAt: Date | null = null) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', anonymizedAt }),
        update: jest.fn().mockResolvedValue({}),
      },
      request: {
        findMany: jest.fn().mockResolvedValue([{ id: 'request-1' }, { id: 'request-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      publicRequestSubmission: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestComment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestActivity: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      cartRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      customRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wholesaleRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      customerActivity: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const transaction = jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    return { service: new CustomersService(prisma), transaction, tx };
  }

  type MergeFixtureCustomer = {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    phone: string;
    normalizedPhone: string;
    email: string | null;
    normalizedEmail: string | null;
    company: string | null;
    anonymizedAt: Date | null;
  };

  function mergeFixture() {
    const target: MergeFixtureCustomer = {
      id: 'target-1',
      firstName: 'Анна',
      lastName: 'Иванова',
      middleName: 'Петровна',
      phone: '+7 (900) 111-22-33',
      normalizedPhone: '79001112233',
      email: 'anna@example.ru',
      normalizedEmail: 'anna@example.ru',
      company: 'Альфа',
      anonymizedAt: null,
    };
    const source: MergeFixtureCustomer = {
      id: 'source-1',
      firstName: 'Мария',
      lastName: 'Сидорова',
      middleName: 'Игоревна',
      phone: '+7 (900) 444-55-66',
      normalizedPhone: '79004445566',
      email: 'maria@example.ru',
      normalizedEmail: 'maria@example.ru',
      company: 'Бета',
      anonymizedAt: null,
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      request: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      customerActivity: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        create: jest.fn().mockResolvedValue({}),
      },
      customer: {
        // Contacts are read inside the transaction, under the per-customer locks.
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === target.id ? target : source),
        ),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const transaction = jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const service = new CustomersService(prisma);
    jest.spyOn(service, 'getCustomer').mockResolvedValue({} as never);
    return { service, target, source, tx, transaction };
  }

  it('redacts contact fields and free text while preserving request history', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-09T10:00:00.000Z'));
    const { service, tx } = anonymizationFixture();

    await expect(
      service.anonymizeCustomer(
        'customer-1',
        { reason: 'Заявление субъекта', confirmation: 'ОБЕЗЛИЧИТЬ' },
        'admin-1',
      ),
    ).resolves.toEqual({
      ok: true,
      anonymizedAt: new Date('2026-09-09T10:00:00.000Z'),
      requestsAnonymized: 2,
    });

    expect(tx.request.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['request-1', 'request-2'] } },
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
    expect(tx.cartRequest.updateMany).toHaveBeenCalledWith({
      where: { requestId: { in: ['request-1', 'request-2'] } },
      data: { deliveryAddress: null, deliveryAddressDetails: Prisma.DbNull },
    });
    expect(tx.publicRequestSubmission.deleteMany).toHaveBeenCalledWith({
      where: { requestId: { in: ['request-1', 'request-2'] } },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: {
        firstName: 'Обезличенный',
        lastName: 'клиент',
        middleName: null,
        phone: 'Удалено',
        normalizedPhone: null,
        email: null,
        normalizedEmail: null,
        company: null,
        anonymizedAt: new Date('2026-09-09T10:00:00.000Z'),
      },
    });
    expect(tx.customerActivity.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-1',
        userId: 'admin-1',
        type: 'ANONYMIZED',
        data: { reason: 'Заявление субъекта', requestsAnonymized: 2 },
      },
    });
  });

  it('rejects repeated anonymization before changing related data', async () => {
    const { service, tx } = anonymizationFixture(new Date('2026-09-08T12:00:00.000Z'));

    await expect(
      service.anonymizeCustomer(
        'customer-1',
        { reason: 'Повторный запрос', confirmation: 'ОБЕЗЛИЧИТЬ' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.request.findMany).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('rejects a blank audit reason before starting a transaction', async () => {
    const { service, transaction } = anonymizationFixture();

    await expect(
      service.anonymizeCustomer(
        'customer-1',
        { reason: '   ', confirmation: 'ОБЕЗЛИЧИТЬ' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechecks retention eligibility under the customer lock', async () => {
    const { service, tx } = anonymizationFixture();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      anonymizedAt: null,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      requests: [
        {
          status: 'IN_PROGRESS',
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      ],
    });

    await expect(
      service.anonymizeCustomerByRetention('customer-1', new Date('2026-01-01T00:00:00.000Z')),
    ).resolves.toBe(false);
    expect(tx.request.findMany).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('rejects a merge when conflicting contact values have no explicit selection', async () => {
    const { service, tx } = mergeFixture();

    await expect(
      service.mergeCustomer('target-1', { sourceCustomerId: 'source-1' }, 'manager-1'),
    ).rejects.toThrow('Выберите значение для поля «Имя».');
    expect(tx.customer.delete).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('locks both cards in a stable order before reading them for a merge', async () => {
    const { service, target, source, tx } = mergeFixture();
    const order: string[] = [];
    tx.$executeRaw.mockImplementation((_strings: readonly string[], id: string) => {
      order.push(`lock:${id}`);
      return Promise.resolve(1);
    });
    tx.customer.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      order.push(`read:${where.id}`);
      return Promise.resolve(where.id === target.id ? target : source);
    });

    await expect(
      service.mergeCustomer(target.id, { sourceCustomerId: source.id }, 'manager-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(order).toEqual(['lock:source-1', 'lock:target-1', 'read:target-1', 'read:source-1']);
  });

  it('merges explicitly selected values and preserves both contact snapshots in the audit log', async () => {
    const { service, target, source, tx } = mergeFixture();

    await service.mergeCustomer(
      target.id,
      {
        sourceCustomerId: source.id,
        firstNameSelection: MergeValueSource.TARGET,
        lastNameSelection: MergeValueSource.SOURCE,
        middleNameSelection: MergeValueSource.TARGET,
        phoneSelection: MergeValueSource.SOURCE,
        emailSelection: MergeValueSource.TARGET,
        companySelection: MergeValueSource.SOURCE,
      },
      'manager-1',
    );

    const mergedContact = {
      firstName: target.firstName,
      lastName: source.lastName,
      middleName: target.middleName,
      phone: source.phone,
      normalizedPhone: source.normalizedPhone,
      email: target.email,
      normalizedEmail: target.normalizedEmail,
      company: source.company,
    };
    expect(tx.customer.delete).toHaveBeenCalledWith({ where: { id: source.id } });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: mergedContact,
    });
    expect(tx.customerActivity.create).toHaveBeenCalledWith({
      data: {
        customerId: target.id,
        userId: 'manager-1',
        type: 'MERGED',
        data: {
          sourceCustomerId: source.id,
          sourceName: 'Сидорова Мария Игоревна',
          sourceContact: {
            firstName: source.firstName,
            lastName: source.lastName,
            middleName: source.middleName,
            phone: source.phone,
            email: source.email,
            company: source.company,
          },
          targetContactBefore: {
            firstName: target.firstName,
            lastName: target.lastName,
            middleName: target.middleName,
            phone: target.phone,
            email: target.email,
            company: target.company,
          },
          mergedContact: {
            firstName: mergedContact.firstName,
            lastName: mergedContact.lastName,
            middleName: mergedContact.middleName,
            phone: mergedContact.phone,
            email: mergedContact.email,
            company: mergedContact.company,
          },
          selections: {
            firstName: 'TARGET',
            lastName: 'SOURCE',
            middleName: 'TARGET',
            phone: 'SOURCE',
            email: 'TARGET',
            company: 'SOURCE',
          },
        },
      },
    });
  });

  it('fills empty optional target fields without requiring a conflict selection', async () => {
    const { service, target, source, tx } = mergeFixture();
    target.firstName = source.firstName;
    target.lastName = source.lastName;
    target.middleName = null;
    target.phone = source.phone;
    target.normalizedPhone = source.normalizedPhone;
    target.email = null;
    target.normalizedEmail = null;
    target.company = null;

    await service.mergeCustomer(target.id, { sourceCustomerId: source.id }, 'manager-1');

    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: {
        firstName: source.firstName,
        lastName: source.lastName,
        middleName: source.middleName,
        phone: source.phone,
        normalizedPhone: source.normalizedPhone,
        email: source.email,
        normalizedEmail: source.normalizedEmail,
        company: source.company,
      },
    });
  });

  describe('concurrent card edits', () => {
    const openedAt = new Date('2026-09-24T10:00:00.000Z');
    const card = {
      id: 'customer-1',
      firstName: 'Анна',
      lastName: 'Иванова',
      middleName: null,
      phone: '+7 900 111-22-33',
      normalizedPhone: '79001112233',
      email: null,
      normalizedEmail: null,
      company: null,
      anonymizedAt: null,
      updatedAt: openedAt,
    };
    const edit = {
      expectedUpdatedAt: openedAt.toISOString(),
      firstName: 'Мария',
      lastName: 'Иванова',
      phone: '+7 900 111-22-33',
    };

    function editFixture(current: typeof card, updatedCount = 1) {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        customer: { updateMany: jest.fn().mockResolvedValue({ count: updatedCount }) },
        customerActivity: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        customer: {
          findUnique: jest.fn().mockResolvedValue(current),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      };
      const service = new CustomersService(prisma as unknown as PrismaService);
      jest.spyOn(service, 'getCustomer').mockResolvedValue({} as never);
      return { service, tx, prisma };
    }

    it('rejects a save based on an outdated card without writing', async () => {
      const { service, prisma } = editFixture({
        ...card,
        updatedAt: new Date('2026-09-24T10:00:01.000Z'),
      });

      await expect(service.updateCustomer(card.id, edit, 'manager-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 409 when another edit commits between the read and the write', async () => {
      const { service, tx } = editFixture(card, 0);

      await expect(service.updateCustomer(card.id, edit, 'manager-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.customer.updateMany).toHaveBeenCalledWith({
        where: { id: card.id, updatedAt: openedAt, anonymizedAt: null },
        data: expect.objectContaining({ firstName: 'Мария' }) as unknown,
      });
      expect(tx.customerActivity.create).not.toHaveBeenCalled();
    });
  });

  it('searches historical request contacts as well as the customer card', async () => {
    let capturedWhere: Prisma.CustomerWhereInput | undefined;
    const findMany = jest.fn((args: Prisma.CustomerFindManyArgs) => {
      capturedWhere = args.where;
      return Promise.resolve([]);
    });
    const prisma = {
      customer: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;
    const service = new CustomersService(prisma);
    const query = new CustomerQueryDto();
    query.search = 'old@example.ru';
    query.sortBy = 'name';

    await service.getCustomers(query);

    expect(capturedWhere?.OR).toContainEqual({
      requests: {
        some: {
          OR: [
            { phone: { contains: 'old@example.ru', mode: 'insensitive' } },
            { email: { contains: 'old@example.ru', mode: 'insensitive' } },
          ],
        },
      },
    });
  });

  it('sorts last activity by the latest request date instead of customer.updatedAt', async () => {
    let capturedSql: Prisma.Sql | undefined;
    const lastActivityQuery = jest.fn((sql: Prisma.Sql) => {
      capturedSql = sql;
      return Promise.resolve([{ id: 'customer-2' }, { id: 'customer-1' }]);
    });
    const customers = [
      {
        id: 'customer-1',
        firstName: 'Первый',
        lastName: 'Клиент',
        middleName: null,
        phone: '+70000000001',
        email: null,
        company: null,
        anonymizedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        lastRequestAt: new Date('2026-02-01T00:00:00.000Z'),
      },
      {
        id: 'customer-2',
        firstName: 'Второй',
        lastName: 'Клиент',
        middleName: null,
        phone: '+70000000002',
        email: null,
        company: null,
        anonymizedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastRequestAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ];
    const findMany = jest.fn().mockResolvedValue(customers);
    const groupBy = jest.fn().mockResolvedValue([
      { customerId: 'customer-1', _count: { _all: 3 } },
      { customerId: 'customer-2', _count: { _all: 1 } },
    ]);
    const prisma = {
      $queryRaw: lastActivityQuery,
      customer: { findMany, count: jest.fn().mockResolvedValue(2) },
      request: { groupBy },
    } as unknown as PrismaService;
    const service = new CustomersService(prisma);
    const query = new CustomerQueryDto();

    const result = await service.getCustomers(query);

    expect(
      result.data.map(({ id, lastActivity, requestCount }) => ({ id, lastActivity, requestCount })),
    ).toEqual([
      { id: 'customer-2', lastActivity: new Date('2026-08-01T00:00:00.000Z'), requestCount: 1 },
      { id: 'customer-1', lastActivity: new Date('2026-02-01T00:00:00.000Z'), requestCount: 3 },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['customer-2', 'customer-1'] } } }),
    );
    // PERF-01: the stored, indexed value instead of MAX() over every customer's requests.
    const sql = capturedSql?.sql ?? '';
    expect(sql).toContain('"lastRequestAt" DESC NULLS LAST');
    expect(sql).not.toContain('MAX(');
    expect(sql).not.toContain('updatedAt');
    // Request counts only for this page, not a GROUP BY over every request.
    expect(groupBy).toHaveBeenCalledWith({
      by: ['customerId'],
      where: { customerId: { in: ['customer-2', 'customer-1'] } },
      _count: { _all: true },
    });
    expect((findMany.mock.calls as Array<[unknown]>)[0]?.[0]).not.toHaveProperty('select._count');
  });
});
