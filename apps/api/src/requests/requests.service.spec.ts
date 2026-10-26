import { Prisma, RequestStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  PreconditionFailedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from './requests.service';
import {
  DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
  DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
} from './personal-data-document';

describe('RequestsService public request creation', () => {
  const createdAt = new Date('2026-09-06T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T10:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  function createFixture() {
    let createdPayloadHash: string | undefined;
    const tx = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            legacyId: 1001,
            name: 'Гидроцилиндр',
            sku: 'SKU-1',
            price: new Prisma.Decimal('1250.50'),
          },
        ]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'customer-2' }),
        update: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      request: {
        create: jest.fn().mockResolvedValue({ id: 'request-1', sequence: 42 }),
        update: jest.fn().mockResolvedValue({
          id: 'request-1',
          number: '42',
          createdAt,
        }),
      },
      customRequest: { create: jest.fn().mockResolvedValue({}) },
      wholesaleRequest: { create: jest.fn().mockResolvedValue({}) },
      cartRequest: { create: jest.fn().mockResolvedValue({}) },
      consent: { create: jest.fn().mockResolvedValue({}) },
      requestActivity: { create: jest.fn().mockResolvedValue({}) },
      customerActivity: { create: jest.fn().mockResolvedValue({}) },
      publicRequestSubmission: {
        create: jest.fn((input: { data: { payloadHash: string } }) => {
          createdPayloadHash = input.data.payloadHash;
          return Promise.resolve({});
        }),
      },
    };
    const prismaMock = {
      publicRequestSubmission: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const prisma = prismaMock as unknown as PrismaService;

    return {
      service: new RequestsService(prisma),
      prismaMock,
      tx,
      getCreatedPayloadHash: () => createdPayloadHash,
    };
  }

  const customRequest = {
    firstName: 'Подменённое имя',
    lastName: 'Подменённая фамилия',
    middleName: 'Подменённое отчество',
    phone: '+7 999 123-45-67',
    email: 'customer@example.com',
    comment: 'Новая заявка',
    personalDataConsent: true as const,
    documentVersion: DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
  };

  it('keeps an ambiguous same-phone contact separate and does not expose existing PII', async () => {
    const { service, tx } = createFixture();
    tx.customer.findMany.mockResolvedValue([
      {
        id: 'customer-1',
        firstName: 'Настоящее имя',
        lastName: 'Настоящая фамилия',
        middleName: 'Секретное отчество',
        normalizedEmail: 'private@example.com',
      },
    ]);

    const result = await service.createCustomRequest(customRequest, 'custom-key');

    expect(result).toEqual({ number: '42', createdAt });
    expect(Object.keys(result)).toEqual(['number', 'createdAt']);
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.request.create).toHaveBeenCalledWith({
      data: {
        type: 'CUSTOM',
        customerId: 'customer-2',
        responseDueAt: new Date('2026-09-06T11:00:00.000Z'),
        firstName: 'Подменённое имя',
        lastName: 'Подменённая фамилия',
        middleName: 'Подменённое отчество',
        phone: '+7 999 123-45-67',
        email: 'customer@example.com',
        company: undefined,
        comment: 'Новая заявка',
      },
      select: { id: true, sequence: true },
    });
    expect(tx.customerActivity.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-2',
        type: 'CREATED',
        data: {
          source: 'request',
          identityResolution: 'POTENTIAL_DUPLICATE',
          potentialDuplicateCustomerIds: ['customer-1'],
        },
      },
    });
  });

  it('automatically links a unique same-phone and same-name contact', async () => {
    const { service, tx } = createFixture();
    tx.customer.findMany.mockResolvedValue([
      {
        id: 'customer-1',
        firstName: customRequest.firstName,
        lastName: customRequest.lastName,
        middleName: null,
        normalizedEmail: null,
      },
    ]);

    await service.createCustomRequest(customRequest, 'matching-name-key');

    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(tx.request.create).toHaveBeenCalledWith({
      data: {
        type: 'CUSTOM',
        customerId: 'customer-1',
        responseDueAt: new Date('2026-09-06T11:00:00.000Z'),
        firstName: 'Подменённое имя',
        lastName: 'Подменённая фамилия',
        middleName: 'Подменённое отчество',
        phone: '+7 999 123-45-67',
        email: 'customer@example.com',
        company: undefined,
        comment: 'Новая заявка',
      },
      select: { id: true, sequence: true },
    });
  });

  it('creates a customer for a previously unknown contact', async () => {
    const { service, tx } = createFixture();
    const result = await service.createCustomRequest(customRequest, 'custom-key');

    expect(result).toEqual({ number: '42', createdAt });
    expect(tx.customer.create).toHaveBeenCalledWith({
      data: {
        firstName: 'Подменённое имя',
        lastName: 'Подменённая фамилия',
        middleName: 'Подменённое отчество',
        phone: '+7 999 123-45-67',
        normalizedPhone: '+79991234567',
        email: 'customer@example.com',
        normalizedEmail: 'customer@example.com',
        company: undefined,
      },
    });
    expect(tx.customerActivity.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-2',
        type: 'CREATED',
        data: {
          source: 'request',
          identityResolution: 'NEW_CONTACT',
          potentialDuplicateCustomerIds: [],
        },
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('uses the same restricted receipt for wholesale requests', async () => {
    const { service } = createFixture();

    const result = await service.createWholesaleRequest(
      {
        ...customRequest,
        email: 'buyer@example.com',
      },
      'wholesale-key',
    );

    expect(result).toEqual({ number: '42', createdAt });
    expect(Object.keys(result)).toEqual(['number', 'createdAt']);
  });

  it('stores the active server-side consent evidence', async () => {
    const { service, tx } = createFixture();

    await service.createCustomRequest(customRequest, 'consent-evidence-key');

    expect(tx.consent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        type: 'PERSONAL_DATA',
        documentVersion: DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
        documentHash: DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
        source: 'WEB_FORM',
      },
    });
  });

  it.each(['2026-01-01', 'forged-future-version'])(
    'rejects stale or forged consent version %s before creating data',
    async (documentVersion) => {
      const { service, prismaMock } = createFixture();

      await expect(
        service.createCustomRequest({ ...customRequest, documentVersion }, 'invalid-consent-key'),
      ).rejects.toBeInstanceOf(PreconditionFailedException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  it('does not attach a new phone to a customer found only by email', async () => {
    const { service, tx } = createFixture();
    tx.customer.create.mockResolvedValue({ id: 'customer-with-new-phone' });

    const result = await service.createWholesaleRequest(
      { ...customRequest, email: 'shared@example.com' },
      'shared-email-key',
    );

    expect(result).toEqual({ number: '42', createdAt });
    expect(tx.customer.findMany).toHaveBeenCalledTimes(1);
    expect(tx.customer.findMany).toHaveBeenCalledWith({
      where: { normalizedPhone: '+79991234567' },
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
    expect(tx.customer.create).toHaveBeenCalledWith({
      data: {
        firstName: 'Подменённое имя',
        lastName: 'Подменённая фамилия',
        middleName: 'Подменённое отчество',
        phone: '+7 999 123-45-67',
        normalizedPhone: '+79991234567',
        email: 'shared@example.com',
        normalizedEmail: 'shared@example.com',
        company: undefined,
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('uses the same restricted receipt for cart requests', async () => {
    const { service } = createFixture();

    const result = await service.createCartRequest(
      {
        ...customRequest,
        deliveryType: 'PICKUP',
        paymentType: 'ON_RECEIPT',
        items: [{ productId: 'product-1', quantity: 2 }],
      },
      'cart-key',
    );

    expect(result).toEqual({ number: '42', createdAt });
    expect(Object.keys(result)).toEqual(['number', 'createdAt']);
  });

  it('returns the first request for a repeated idempotency key', async () => {
    const { service, prismaMock, getCreatedPayloadHash } = createFixture();

    const first = await service.createCustomRequest(customRequest, 'repeat-key');
    prismaMock.publicRequestSubmission.findUnique.mockResolvedValue({
      payloadHash: getCreatedPayloadHash(),
      request: { number: '42', createdAt },
    });
    const repeated = await service.createCustomRequest(customRequest, 'repeat-key');

    expect(repeated).toEqual(first);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a key with a different payload', async () => {
    const { service, prismaMock, getCreatedPayloadHash } = createFixture();

    await service.createCustomRequest(customRequest, 'conflicting-key');
    prismaMock.publicRequestSubmission.findUnique.mockResolvedValue({
      payloadHash: getCreatedPayloadHash(),
      request: { number: '42', createdAt },
    });

    await expect(
      service.createCustomRequest(
        { ...customRequest, comment: 'Другая заявка' },
        'conflicting-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('requires an idempotency key for every public request', async () => {
    const { service } = createFixture();

    await expect(service.createCustomRequest(customRequest)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('RequestsService list filters', () => {
  it('does not let the overdue filter overwrite an explicit status', async () => {
    let findManyInput: unknown;
    const request = {
      findMany: jest.fn((input: unknown) => {
        findManyInput = input;
        return Promise.resolve([]);
      }),
      count: jest.fn().mockResolvedValue(0),
    };
    const service = new RequestsService({
      request,
    } as unknown as PrismaService);

    await service.getRequests(
      {
        status: 'COMPLETED',
        attention: 'overdue',
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 1,
        limit: 20,
      },
      'user-1',
    );

    const input = findManyInput as {
      where: {
        status: string;
        AND: [{ status: string }, { responseDueAt: { lte: Date } }];
      };
    };
    expect(input.where.status).toBe('COMPLETED');
    expect(input.where.AND[0]).toEqual({ status: 'NEW' });
    expect(input.where.AND[1].responseDueAt.lte).toBeInstanceOf(Date);
  });
});

describe('RequestsService request details', () => {
  it('returns an S3 image URL for each current cart product without exposing storage fields', async () => {
    const previousPublicUrl = process.env.S3_PUBLIC_URL;
    process.env.S3_PUBLIC_URL = 'https://cdn.example.com/bucket';
    const request = {
      findUnique: jest.fn((input: unknown) => {
        void input;
        return Promise.resolve({
          id: 'request-1',
          status: RequestStatus.NEW,
          responseDueAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          readStates: [],
          comments: [],
          activities: [],
          consents: [],
          _count: { comments: 21, activities: 12, consents: 3 },
          cartRequest: {
            id: 'cart-1',
            items: [
              {
                id: 'item-1',
                productName: 'Гидроцилиндр',
                product: {
                  imageKey: 'catalog/100001.webp',
                },
              },
            ],
          },
        });
      }),
    };
    const service = new RequestsService({ request } as unknown as PrismaService);

    try {
      const result = await service.getRequest('request-1', 'user-1', {
        commentsPage: 2,
        activitiesPage: 1,
        consentsPage: 1,
        historyLimit: 10,
      });

      expect(result.cartRequest?.items[0]).toMatchObject({
        id: 'item-1',
        productName: 'Гидроцилиндр',
        imagePath: 'https://cdn.example.com/bucket/catalog/100001.webp',
      });
      expect(result.cartRequest?.items[0]).not.toHaveProperty('product');
      expect(result.historyPagination).toEqual({
        comments: { page: 2, limit: 10, total: 21, totalPages: 3 },
        activities: { page: 1, limit: 10, total: 12, totalPages: 2 },
        consents: { page: 1, limit: 10, total: 3, totalPages: 1 },
      });
      const findUniqueInput = request.findUnique.mock.calls[0]?.[0] as {
        include: {
          comments: { skip: number; take: number };
          activities: { skip: number; take: number };
          consents: { skip: number; take: number };
        };
      };
      expect(findUniqueInput.include.comments).toMatchObject({ skip: 10, take: 10 });
      expect(findUniqueInput.include.activities).toMatchObject({ skip: 0, take: 10 });
      expect(findUniqueInput.include.consents).toMatchObject({ skip: 0, take: 10 });
    } finally {
      if (previousPublicUrl === undefined) delete process.env.S3_PUBLIC_URL;
      else process.env.S3_PUBLIC_URL = previousPublicUrl;
    }
  });
});

describe('RequestsService dashboard statistics', () => {
  it('loads all dashboard counters with one conditional aggregate', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        total: 25n,
        newRequests: 4n,
        cart: 10n,
        custom: 8n,
        wholesale: 7n,
        inProgress: 5n,
        contacted: 3n,
        completed: 11n,
        cancelled: 2n,
        unread: 6n,
        overdue: 1n,
      },
    ]);
    const service = new RequestsService({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(service.getStats('user-1')).resolves.toEqual({
      total: 25,
      new: 4,
      cart: 10,
      custom: 8,
      wholesale: 7,
      inProgress: 5,
      contacted: 3,
      completed: 11,
      cancelled: 2,
      unread: 6,
      overdue: 1,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
