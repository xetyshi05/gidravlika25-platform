import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConsentSource,
  ConsentType,
  CustomerActivityType,
  Prisma,
  RequestActivityType,
  RequestStatus,
  RequestType,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { AppModule } from '../src/app.module';
import { CatalogImagesService } from '../src/backoffice/catalog-images.service';
import { hashPassword } from '../src/auth/password-hash';
import { configureApi } from '../src/configure-app';
import { OpenApiContractRecorder } from './openapi-contract';
import { StructuredLogger } from '../src/observability/structured-logger';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
  DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
} from '../src/requests/personal-data-document';

@Controller('__e2e')
class FailureController {
  @Get('failure')
  fail() {
    throw new Error('Diagnostic private@example.test +7 (999) 123-45-67 Bearer secret-token-value');
  }

  @Get('http-failure')
  failWithHttpException() {
    throw new InternalServerErrorException('Database failed for private@example.test');
  }
}

describe('Critical API flows (e2e)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService;
  let sequence = 0;
  const logLines: string[] = [];
  const contract = new OpenApiContractRecorder();

  beforeAll(async () => {
    process.env.PUBLIC_REQUEST_RATE_LIMIT_MAX = '100';
    process.env.REQUEST_FIRST_RESPONSE_MINUTES = '60';
    process.env.PERSONAL_DATA_DOCUMENT_VERSION = DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION;
    process.env.PERSONAL_DATA_DOCUMENT_HASH = DEFAULT_PERSONAL_DATA_DOCUMENT_HASH;
    // Real ALTCHA challenges, cheap enough to solve for every public request.
    process.env.ALTCHA_COST = '1';
    process.env.ALTCHA_MAX_COUNTER = '20';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FailureController],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApi(
      app,
      new StructuredLogger((line) => {
        logLines.push(line);
      }),
    );
    app.use(contract.middleware);
    // Listen once: on a stopped server supertest listens and closes per request,
    // so a finished request closes the server under concurrent ones (ECONNRESET).
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database()::text AS "database"
    `;
    if (!connection?.database.startsWith('gidravlika_e2e_')) {
      throw new Error(
        `Refusing to run E2E tests outside a disposable database (got ${connection?.database ?? 'unknown'}).`,
      );
    }
  });

  beforeEach(async () => {
    process.env.PUBLIC_REQUEST_RATE_LIMIT_MAX = '100';
    process.env.PUBLIC_REQUEST_CONTACT_LIMIT_MAX = '100';
    process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_MAX = '10000';
    delete process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_WINDOW_MS;
    await prisma.publicRequestRateLimit.deleteMany();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // Only with E2E_DATABASE_ROLES=true (CI): production roles from prisma/database-roles.sql.
  (process.env.E2E_DATABASE_ROLES === 'true' ? it : it.skip)(
    'runs the API as a DML-only database role',
    async () => {
      const [role] = await prisma.$queryRaw<Array<{ name: string; superuser: boolean }>>`
        SELECT rolname::text AS "name", rolsuper AS "superuser"
        FROM pg_roles WHERE rolname = current_user
      `;
      expect(role).toEqual({ name: 'app_runtime', superuser: false });
      const denied = /permission denied|must be owner/;
      await expect(
        prisma.$executeRawUnsafe('CREATE TABLE "RuntimeProbe" ("id" integer)'),
      ).rejects.toThrow(denied);
      await expect(
        prisma.$executeRawUnsafe('CREATE TEMP TABLE "RuntimeProbe" ("id" integer)'),
      ).rejects.toThrow(denied);
      await expect(
        prisma.$executeRawUnsafe('ALTER TABLE "Customer" ADD COLUMN "runtimeProbe" integer'),
      ).rejects.toThrow(denied);
      await expect(prisma.$executeRawUnsafe('TRUNCATE "RequestActivity"')).rejects.toThrow(denied);
      await expect(
        prisma.$queryRawUnsafe('SELECT count(*) FROM "_prisma_migrations"'),
      ).rejects.toThrow(denied);
    },
  );

  it('has no starter route at the root', async () => {
    await request(app!.getHttpServer()).get('/').expect(404);
  });

  it('keeps an ambiguous same-phone person separate and exposes a potential duplicate in CRM', async () => {
    const identity = nextIdentity();
    const existingEmail = `private-${randomUUID()}@example.test`;
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Настоящее имя',
        lastName: 'Настоящая фамилия',
        middleName: 'Секретное отчество',
        phone: identity.phone,
        normalizedPhone: identity.normalizedPhone,
        email: existingEmail,
        normalizedEmail: existingEmail,
        company: 'Существующая компания',
      },
    });
    const payload = publicPayload(identity, {
      firstName: 'Имя из формы',
      lastName: 'Фамилия из формы',
      company: 'Компания из формы',
    });

    const response = await postCustom(payload, `pii-${randomUUID()}`).expect(201);

    const responseBody = response.body as unknown;
    expect(Object.keys(responseBody as object).sort()).toEqual(['createdAt', 'number']);
    expect(JSON.stringify(responseBody)).not.toContain('Секретное отчество');

    const unchangedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(unchangedCustomer).toMatchObject({
      firstName: 'Настоящее имя',
      lastName: 'Настоящая фамилия',
      middleName: 'Секретное отчество',
      company: 'Существующая компания',
    });

    const createdRequest = await prisma.request.findUniqueOrThrow({
      where: { number: receiptNumber(responseBody) },
    });
    expect(createdRequest).toMatchObject({
      firstName: 'Имя из формы',
      lastName: 'Фамилия из формы',
      company: 'Компания из формы',
    });
    expect(createdRequest.customerId).not.toBe(customer.id);
    await expect(
      prisma.customer.count({ where: { normalizedPhone: identity.normalizedPhone } }),
    ).resolves.toBe(2);

    const manager = await createUser(UserRole.MANAGER);
    const token = await createSession(manager.id, 'CRM');
    const details = await authenticatedGet(`/customers/${createdRequest.customerId}`, token).expect(
      200,
    );
    expect(potentialDuplicateIds(details.body as unknown)).toContain(customer.id);
    await expect(
      prisma.consent.findFirstOrThrow({ where: { requestId: createdRequest.id } }),
    ).resolves.toMatchObject({
      documentVersion: DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
      documentHash: DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
      source: 'WEB_FORM',
    });
  });

  it('automatically links a unique same-phone and same-email contact', async () => {
    const identity = nextIdentity();
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Старое имя',
        lastName: 'Старая фамилия',
        phone: identity.phone,
        normalizedPhone: identity.normalizedPhone,
        email: identity.email,
        normalizedEmail: identity.email,
      },
    });

    const created = await postCustom(
      publicPayload(identity, { firstName: 'Новое имя', lastName: 'Новая фамилия' }),
      `confident-email-${randomUUID()}`,
    ).expect(201);
    const createdRequest = await prisma.request.findUniqueOrThrow({
      where: { number: receiptNumber(created.body as unknown) },
    });

    expect(createdRequest.customerId).toBe(customer.id);
    await expect(
      prisma.customer.count({ where: { normalizedPhone: identity.normalizedPhone } }),
    ).resolves.toBe(1);
  });

  it.each(['2026-01-01', 'forged-future-version'])(
    'rejects stale or forged consent version %s without creating a request',
    async (documentVersion) => {
      const identity = nextIdentity();
      const response = await postCustom(
        { ...publicPayload(identity), documentVersion },
        `consent-${randomUUID()}`,
      ).expect(412);

      const responseBody = response.body as unknown;
      expect(responseBody).toMatchObject({ statusCode: 412 });
      if (
        !responseBody ||
        typeof responseBody !== 'object' ||
        !('message' in responseBody) ||
        typeof responseBody.message !== 'string'
      ) {
        throw new Error('Expected an actionable consent-version error.');
      }
      expect(responseBody.message).toMatch(/обновились/i);
      await expectRequestCount(identity.phone, 0);
    },
  );

  it('returns the original receipt when an idempotency key is repeated', async () => {
    const identity = nextIdentity();
    const payload = publicPayload(identity);
    const idempotencyKey = `repeat-${randomUUID()}`;

    const first = await postCustom(payload, idempotencyKey).expect(201);
    const repeated = await postCustom(payload, idempotencyKey).expect(201);

    expect(repeated.body).toEqual(first.body);
    await expectRequestCount(identity.phone, 1);
  });

  it('rate limits repeated public submissions from the same client', async () => {
    process.env.PUBLIC_REQUEST_RATE_LIMIT_MAX = '1';
    const firstIdentity = nextIdentity();
    const secondIdentity = nextIdentity();

    await postCustom(publicPayload(firstIdentity), `rate-first-${randomUUID()}`).expect(201);
    await postCustom(publicPayload(secondIdentity), `rate-second-${randomUUID()}`).expect(429);
  });

  it('stores nothing for a submission without a valid CAPTCHA', async () => {
    const identity = nextIdentity();
    const payload = publicPayload(identity);

    const missing = await postCustom({ ...payload, altcha: null }, `captcha-none-${randomUUID()}`);
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: 'CAPTCHA_REQUIRED' });

    const forged = Buffer.from(
      JSON.stringify({
        challenge: { parameters: { nonce: 'forged', expiresAt: 4_102_444_800 }, signature: 'x' },
        solution: { counter: 1, derivedKey: 'x' },
      }),
    ).toString('base64');
    const invalid = await postCustom({ ...payload, altcha: forged }, `captcha-bad-${randomUUID()}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: 'CAPTCHA_INVALID' });

    await expectRequestCount(identity.phone, 0);
    expect(
      await prisma.customer.count({ where: { normalizedPhone: identity.normalizedPhone } }),
    ).toBe(0);
    expect(await prisma.consent.count({ where: { request: { phone: identity.phone } } })).toBe(0);
  });

  it('accepts a CAPTCHA solution once but returns the receipt for an idempotent retry', async () => {
    const identity = nextIdentity();
    const payload = publicPayload(identity);
    const altcha = await solvedCaptcha();
    const idempotencyKey = `captcha-once-${randomUUID()}`;

    const first = await postCustom({ ...payload, altcha }, idempotencyKey).expect(201);
    // A retry after a lost response reuses the key: same receipt, even with a spent solution.
    const retried = await postCustom({ ...payload, altcha }, idempotencyKey).expect(201);
    expect(retried.body).toEqual(first.body);

    const replayed = await postCustom(
      { ...payload, comment: 'Другая заявка', altcha },
      `captcha-replay-${randomUUID()}`,
    );
    expect(replayed.status).toBe(400);
    expect(replayed.body).toMatchObject({ code: 'CAPTCHA_REPLAYED' });
    await expectRequestCount(identity.phone, 1);
  });

  it('limits submissions per phone and email across IP addresses', async () => {
    process.env.PUBLIC_REQUEST_CONTACT_LIMIT_MAX = '2';
    const identity = nextIdentity();
    const otherPhone = nextIdentity();

    await postCustom(publicPayload(identity), `contact-1-${randomUUID()}`).expect(201);
    // The same number in another format counts against the same budget.
    await postCustom(
      { ...publicPayload(identity), phone: `8${identity.normalizedPhone.slice(2)}` },
      `contact-2-${randomUUID()}`,
    ).expect(201);
    const limited = await postCustom(publicPayload(identity), `contact-3-${randomUUID()}`);
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'PUBLIC_REQUEST_CONTACT_LIMITED' });

    // Another phone with the same email (different case) is limited by the email budget.
    const sameEmail = await postCustom(
      { ...publicPayload(otherPhone), email: identity.email.toUpperCase() },
      `contact-4-${randomUUID()}`,
    );
    expect(sameEmail.status).toBe(429);
    await expectRequestCount(otherPhone.phone, 0);
    expect(
      await prisma.request.count({
        where: { customer: { normalizedPhone: identity.normalizedPhone } },
      }),
    ).toBe(2);
  });

  it('stops public submissions when the global budget is spent and counts it', async () => {
    // A window length used by no other test gives this test its own counter.
    process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_WINDOW_MS = '3599999';
    process.env.PUBLIC_REQUEST_GLOBAL_LIMIT_MAX = '1';
    const before = rejectionMetric(await metricsText(), 'global_budget');

    await postCustom(publicPayload(nextIdentity()), `budget-1-${randomUUID()}`).expect(201);
    const identity = nextIdentity();
    const exhausted = await postCustom(publicPayload(identity), `budget-2-${randomUUID()}`);

    expect(exhausted.status).toBe(429);
    expect(exhausted.body).toMatchObject({ code: 'PUBLIC_REQUEST_BUDGET_EXHAUSTED' });
    await expectRequestCount(identity.phone, 0);
    expect(rejectionMetric(await metricsText(), 'global_budget')).toBe(before + 1);
  });

  it('silently discards a public form submission when the honeypot is filled', async () => {
    const identity = nextIdentity();
    const response = await postCustom(
      { ...publicPayload(identity), website: 'https://spam.example' },
      `honeypot-${randomUUID()}`,
    ).expect(201);
    const responseBody = response.body as unknown;

    expect(receiptNumber(responseBody)).toMatch(/^\d{6}$/);
    expect(Number.isNaN(Date.parse(receiptCreatedAt(responseBody)))).toBe(false);
    await expectRequestCount(identity.phone, 0);
    await expect(
      prisma.customer.count({ where: { normalizedPhone: identity.normalizedPhone } }),
    ).resolves.toBe(0);
    await expect(prisma.publicRequestRateLimit.count()).resolves.toBe(0);
  });

  it('deduplicates a new customer across concurrent requests', async () => {
    const identity = nextIdentity();
    const payload = publicPayload(identity);

    const responses = await Promise.all([
      postCustom({ ...payload, comment: 'Параллельная заявка 1' }, `concurrent-a-${randomUUID()}`),
      postCustom({ ...payload, comment: 'Параллельная заявка 2' }, `concurrent-b-${randomUUID()}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      await prisma.customer.findMany({
        where: { normalizedEmail: identity.email },
        select: { normalizedPhone: true, normalizedEmail: true },
      }),
    ).toEqual([
      {
        normalizedPhone: identity.normalizedPhone,
        normalizedEmail: identity.email,
      },
    ]);
    await expectRequestCount(identity.phone, 2);
  });

  it('keeps customers with a shared corporate email separated by phone', async () => {
    const firstIdentity = nextIdentity();
    const secondIdentity = nextIdentity();
    const sharedEmail = `shared-${randomUUID()}@example.test`;

    await postCustom(
      publicPayload({ ...firstIdentity, email: sharedEmail }),
      `shared-email-a-${randomUUID()}`,
    ).expect(201);
    await postCustom(
      publicPayload({ ...secondIdentity, email: sharedEmail }),
      `shared-email-b-${randomUUID()}`,
    ).expect(201);

    const customers = await prisma.customer.findMany({
      where: { normalizedEmail: sharedEmail },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        normalizedPhone: true,
        email: true,
        company: true,
        updatedAt: true,
      },
      orderBy: { normalizedPhone: 'asc' },
    });
    expect(customers.map((customer) => customer.normalizedPhone)).toEqual(
      [firstIdentity.normalizedPhone, secondIdentity.normalizedPhone].sort(),
    );
    expect(new Set(customers.map((customer) => customer.id)).size).toBe(2);

    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');
    const edited = customers[0];
    await request(app!.getHttpServer())
      .patch(`/customers/${edited.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedUpdatedAt: edited.updatedAt.toISOString(),
        firstName: edited.firstName,
        lastName: edited.lastName,
        phone: edited.phone,
        email: edited.email,
        company: edited.company,
      })
      .expect(200);
  });

  it('applies Back Office catalog settings to every public catalog surface', async () => {
    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: `Настройки ${suffix}`, slug: `settings-${suffix}` },
    });
    const inStock = await prisma.product.create({
      data: {
        sku: `SETTINGS-IN-${suffix}`,
        name: `Товар в наличии ${suffix}`,
        slug: `settings-in-${suffix}`,
        price: new Prisma.Decimal('12345'),
        stockQuantity: 2,
        categoryId: category.id,
      },
    });
    const outOfStock = await prisma.product.create({
      data: {
        sku: `SETTINGS-OUT-${suffix}`,
        name: `Товар без остатка ${suffix}`,
        slug: `settings-out-${suffix}`,
        price: new Prisma.Decimal('54321'),
        stockQuantity: 0,
        categoryId: category.id,
      },
    });
    const user = await createUser(UserRole.ADMIN);
    const token = await createSession(user.id, 'BACKOFFICE');

    try {
      const savedSettings = await request(app!.getHttpServer())
        .patch('/backoffice/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ lowStockThreshold: 2, showOutOfStock: false, showPrices: false })
        .expect(200);
      expect(savedSettings.body as unknown).toEqual({
        lowStockThreshold: 2,
        showOutOfStock: false,
        showPrices: false,
      });

      await request(app!.getHttpServer())
        .get('/catalog/settings')
        .expect(200)
        .expect({ lowStockThreshold: 2, showOutOfStock: false, showPrices: false });

      const visible = await request(app!.getHttpServer())
        .get(`/catalog/products/page?search=${encodeURIComponent(inStock.sku)}`)
        .expect(200);
      const visibleItems = catalogItems(visible.body as unknown);
      expect(visibleItems).toHaveLength(1);
      expect(visibleItems[0]).toMatchObject({
        id: inStock.id,
        price: null,
        stockStatus: 'LOW_STOCK',
      });

      await request(app!.getHttpServer()).get(`/catalog/products/${outOfStock.slug}`).expect(404);

      const ranges = await request(app!.getHttpServer())
        .get('/catalog/products/filters')
        .expect(200);
      expect(ranges.body as unknown).toMatchObject({ price: { min: null, max: null } });
    } finally {
      await prisma.catalogSettings.upsert({
        where: { id: 'catalog' },
        create: { id: 'catalog' },
        update: { lowStockThreshold: 5, showOutOfStock: true, showPrices: true },
      });
    }
  });

  it('keeps omitted category fields and rejects cycles and orphaning deletes', async () => {
    const suffix = randomUUID();
    const root = await prisma.category.create({
      data: { name: `Корень ${suffix}`, slug: `tree-root-${suffix}` },
    });
    const child = await prisma.category.create({
      data: {
        name: `Раздел ${suffix}`,
        slug: `tree-child-${suffix}`,
        description: 'Описание раздела',
        parentId: root.id,
      },
    });
    const grandchild = await prisma.category.create({
      data: { name: `Подраздел ${suffix}`, slug: `tree-grandchild-${suffix}`, parentId: child.id },
    });
    const token = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');
    const patch = (id: string, body: object) =>
      request(app!.getHttpServer())
        .patch(`/backoffice/categories/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    await patch(child.id, { name: `Переименован ${suffix}`, isActive: false }).expect(200);
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: child.id } }),
    ).resolves.toMatchObject({
      name: `Переименован ${suffix}`,
      slug: child.slug,
      description: 'Описание раздела',
      parentId: root.id,
      isActive: false,
    });

    await patch(root.id, { parentId: grandchild.id }).expect(409);
    await patch(root.id, { parentId: root.id }).expect(409);
    await patch(child.id, { parentId: 'missing-category' }).expect(404);
    await patch(child.id, { name: null }).expect(400);
    expect(
      (await prisma.category.findUniqueOrThrow({ where: { id: root.id } })).parentId,
    ).toBeNull();

    await patch(grandchild.id, { parentId: null }).expect(200);
    await patch(child.id, { description: null }).expect(200);
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: child.id } }),
    ).resolves.toMatchObject({
      description: null,
      parentId: root.id,
    });
    expect(
      (await prisma.category.findUniqueOrThrow({ where: { id: grandchild.id } })).parentId,
    ).toBeNull();

    await request(app!.getHttpServer())
      .delete(`/backoffice/categories/${root.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).parentId).toBe(
      root.id,
    );
    await request(app!.getHttpServer())
      .delete('/backoffice/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [root.id, child.id] })
      .expect(200);
    expect(await prisma.category.count({ where: { id: { in: [root.id, child.id] } } })).toBe(0);
  });

  it('clears nullable product fields with null and keeps omitted ones', async () => {
    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: `Товары ${suffix}`, slug: `clear-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        sku: `CLEAR-${suffix}`,
        name: `Цилиндр ${suffix}`,
        slug: `clear-product-${suffix}`,
        description: 'Полное описание',
        shortDescription: 'Кратко',
        price: new Prisma.Decimal('1000'),
        pistonDiameterMm: 80,
        strokeMm: 400,
        maxPressureMpa: new Prisma.Decimal('25'),
        nominalPressureMpa: new Prisma.Decimal('16'),
        stockQuantity: 3,
        isFeatured: true,
        categoryId: category.id,
      },
    });
    const token = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');
    const patch = async (body: object, status: number) => {
      const { updatedAt } = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { updatedAt: true },
      });
      return request(app!.getHttpServer())
        .patch(`/backoffice/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedUpdatedAt: updatedAt.toISOString(), ...body })
        .expect(status);
    };

    const saved = await patch(
      {
        name: `Цилиндр переименован ${suffix}`,
        description: null,
        shortDescription: '',
        pistonDiameterMm: null,
        maxPressureMpa: null,
        nominalPressureMpa: '',
      },
      200,
    );
    expect(saved.body as unknown).toMatchObject({
      slug: product.slug,
      description: null,
      shortDescription: null,
      pistonDiameterMm: null,
      strokeMm: 400,
      maxPressureMpa: null,
      nominalPressureMpa: null,
      price: '1000',
      stockQuantity: 3,
      isFeatured: true,
    });

    await patch({ price: 10_000_000_000 }, 400);
    await patch({ price: 12.345 }, 400);
    await patch({ maxPressureMpa: 25.123 }, 400);
    await patch({ price: null }, 400);
    await patch({ stockQuantity: null }, 400);
    await patch({ categoryId: 'missing-category' }, 404);
    await request(app!.getHttpServer())
      .post('/backoffice/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `NEW-${suffix}`, name: `Новый ${suffix}`, categoryId: 'missing', price: 1 })
      .expect(404);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toMatchObject({
      price: new Prisma.Decimal('1000'),
      stockQuantity: 3,
      categoryId: category.id,
    });
  });

  it('rejects saves of outdated product and customer cards with 409', async () => {
    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: `Версии ${suffix}`, slug: `versions-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        sku: `VER-${suffix}`,
        name: `Цилиндр ${suffix}`,
        slug: `versions-product-${suffix}`,
        price: new Prisma.Decimal('100'),
        categoryId: category.id,
      },
    });
    const boToken = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');
    const openedAt = product.updatedAt.toISOString();
    const saveProduct = (body: object) =>
      request(app!.getHttpServer())
        .patch(`/backoffice/products/${product.id}`)
        .set('Authorization', `Bearer ${boToken}`)
        .send({ expectedUpdatedAt: openedAt, ...body });

    // Two administrators opened the same version; the second save must not win silently.
    await saveProduct({ name: `Первый ${suffix}` }).expect(200);
    const staleProduct = await saveProduct({ price: 999 }).expect(409);
    expect((staleProduct.body as { message?: string }).message).toContain('уже изменён');
    await request(app!.getHttpServer())
      .patch(`/backoffice/products/${product.id}`)
      .set('Authorization', `Bearer ${boToken}`)
      .send({ name: 'Без версии' })
      .expect(400);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toMatchObject({ name: `Первый ${suffix}`, price: new Prisma.Decimal('100') });
    // A stock change also moves the version, so a form opened before it is stale too.
    const beforeStock = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await request(app!.getHttpServer())
      .patch(`/backoffice/products/${product.id}/stock`)
      .set('Authorization', `Bearer ${boToken}`)
      .send({ delta: 1 })
      .expect(200);
    await request(app!.getHttpServer())
      .patch(`/backoffice/products/${product.id}`)
      .set('Authorization', `Bearer ${boToken}`)
      .send({ expectedUpdatedAt: beforeStock.updatedAt.toISOString(), stockQuantity: 0 })
      .expect(409);

    const identity = nextIdentity();
    await postCustom(publicPayload(identity), `versions-${randomUUID()}`).expect(201);
    const customer = await prisma.customer.findFirstOrThrow({
      where: { normalizedPhone: identity.normalizedPhone },
    });
    const crmToken = await createSession((await createUser(UserRole.MANAGER)).id, 'CRM');
    const saveCustomer = (company: string) =>
      request(app!.getHttpServer())
        .patch(`/customers/${customer.id}`)
        .set('Authorization', `Bearer ${crmToken}`)
        .send({
          expectedUpdatedAt: customer.updatedAt.toISOString(),
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          company,
        });
    await saveCustomer('Первая правка').expect(200);
    await saveCustomer('Вторая правка').expect(409);
    await expect(
      prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
    ).resolves.toMatchObject({ company: 'Первая правка' });
    await expect(
      prisma.customerActivity.count({
        where: { customerId: customer.id, type: CustomerActivityType.UPDATED },
      }),
    ).resolves.toBe(1);
  });

  it('adds concurrent stock changes instead of overwriting them', async () => {
    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: `Остатки ${suffix}`, slug: `stock-${suffix}` },
    });
    const products = await Promise.all(
      ['A', 'B'].map((name) =>
        prisma.product.create({
          data: {
            sku: `STOCK-${name}-${suffix}`,
            name: `Остаток ${name} ${suffix}`,
            slug: `stock-${name.toLowerCase()}-${suffix}`,
            price: new Prisma.Decimal('10'),
            stockQuantity: 5,
            categoryId: category.id,
          },
        }),
      ),
    );
    const ids = products.map((product) => product.id);
    const token = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');
    const single = (delta: number) =>
      request(app!.getHttpServer())
        .patch(`/backoffice/products/${ids[0]}/stock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ delta });
    const bulk = (delta: number) =>
      request(app!.getHttpServer())
        .patch('/backoffice/products/bulk/stock')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids, delta });

    const responses = await Promise.all([
      ...Array.from({ length: 8 }, () => single(1)),
      ...Array.from({ length: 4 }, () => bulk(2)),
    ]);
    expect(responses.map((response) => response.status)).toEqual(Array(12).fill(200));
    const stock = async () =>
      (
        await prisma.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, stockQuantity: true },
        })
      )
        .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
        .map((product) => product.stockQuantity);
    await expect(stock()).resolves.toEqual([5 + 8 + 8, 5 + 8]);

    await bulk(-15).expect(200);
    await expect(stock()).resolves.toEqual([6, 0]);
    await single(-1_000_000_001).expect(400);
    await expect(
      prisma.backofficeActivity.count({
        where: {
          action: { in: ['STOCK_CHANGED', 'STOCK_BULK_CHANGED'] },
          details: { path: ['id'], equals: ids[0] },
        },
      }),
    ).resolves.toBe(8);
  });

  // Needs DDL for a failing trigger, which the DML-only runtime role cannot create.
  (process.env.E2E_DATABASE_ROLES === 'true' ? it.skip : it)(
    'rolls a Back Office change back when its audit record cannot be written',
    async () => {
      const suffix = randomUUID();
      const category = await prisma.category.create({
        data: { name: `Аудит ${suffix}`, slug: `audit-${suffix}` },
      });
      const product = await prisma.product.create({
        data: {
          sku: `AUDIT-${suffix}`,
          name: `Аудит ${suffix}`,
          slug: `audit-product-${suffix}`,
          price: new Prisma.Decimal('10'),
          stockQuantity: 3,
          categoryId: category.id,
        },
      });
      const token = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION e2e_fail_backoffice_audit() RETURNS trigger AS $$
        BEGIN
          IF NEW."details"->>'id' = '${product.id}' THEN
            RAISE EXCEPTION 'audit storage unavailable';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER e2e_fail_backoffice_audit BEFORE INSERT ON "BackofficeActivity"
        FOR EACH ROW EXECUTE FUNCTION e2e_fail_backoffice_audit()
      `);
      try {
        await request(app!.getHttpServer())
          .patch(`/backoffice/products/${product.id}/stock`)
          .set('Authorization', `Bearer ${token}`)
          .send({ delta: 4 })
          .expect(500);
        await request(app!.getHttpServer())
          .patch(`/backoffice/products/${product.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ expectedUpdatedAt: product.updatedAt.toISOString(), name: 'Не сохранится' })
          .expect(500);
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER e2e_fail_backoffice_audit ON "BackofficeActivity"',
        );
        await prisma.$executeRawUnsafe('DROP FUNCTION e2e_fail_backoffice_audit()');
      }
      await expect(
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).resolves.toMatchObject({ name: product.name, stockQuantity: 3 });
    },
  );

  it('keeps an active administrator when two administrators demote each other at once', async () => {
    // Only the two administrators of this test are active, so each one is the other's "last".
    await prisma.user.updateMany({
      where: { role: UserRole.ADMIN, isActive: true },
      data: { isActive: false },
    });
    const [first, second] = await Promise.all([
      createUser(UserRole.ADMIN),
      createUser(UserRole.ADMIN),
    ]);
    const [firstToken, secondToken] = await Promise.all([
      createSession(first.id, 'BACKOFFICE'),
      createSession(second.id, 'BACKOFFICE'),
    ]);
    const demote = (token: string, id: string) =>
      request(app!.getHttpServer())
        .patch(`/backoffice/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false });

    const responses = await Promise.all([
      demote(firstToken, second.id),
      demote(secondToken, first.id),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    await expect(
      prisma.user.count({ where: { id: { in: [first.id, second.id] }, isActive: true } }),
    ).resolves.toBe(1);
  });

  it('queues files of deleted products in the delete transaction and retries failures', async () => {
    const previousOriginals = process.env.MEDIA_ORIGINALS_DIR;
    const originals = await mkdtemp(join(tmpdir(), 'e2e-originals-'));
    process.env.MEDIA_ORIGINALS_DIR = originals;
    try {
      const suffix = randomUUID();
      const category = await prisma.category.create({
        data: { name: `Файлы ${suffix}`, slug: `files-${suffix}` },
      });
      const [removable, stuck] = await Promise.all(
        ['A', 'B'].map((name) =>
          prisma.product.create({
            data: {
              sku: `FILES-${name}-${suffix}`,
              name: `Файлы ${name} ${suffix}`,
              slug: `files-${name.toLowerCase()}-${suffix}`,
              price: new Prisma.Decimal('10'),
              categoryId: category.id,
            },
          }),
        ),
      );
      const removableKey = `catalog/${removable.id}/${randomUUID()}.png`;
      const stuckKey = `catalog/${stuck.id}/${randomUUID()}.png`;
      await mkdir(join(originals, 'catalog', removable.id), { recursive: true });
      await writeFile(join(originals, removableKey), 'original');
      // A non-empty directory in place of the file makes this deletion fail.
      await mkdir(join(originals, stuckKey, 'inner'), { recursive: true });
      await prisma.product.update({
        where: { id: removable.id },
        data: { imageOriginalKey: removableKey },
      });
      await prisma.product.update({
        where: { id: stuck.id },
        data: { imageOriginalKey: stuckKey },
      });
      const token = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');

      await request(app!.getHttpServer())
        .delete('/backoffice/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [removable.id, stuck.id] })
        .expect(200, { deleted: 2 });

      await expect(access(join(originals, removableKey))).rejects.toThrow();
      const queued = await prisma.storageCleanup.findMany({
        where: { key: { in: [removableKey, stuckKey] } },
      });
      expect(queued).toEqual([
        expect.objectContaining({
          location: 'ORIGINALS',
          key: stuckKey,
          reason: 'product deletion',
          attempts: 1,
          lastError: expect.any(String) as unknown,
        }),
      ]);
      expect(queued[0]?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      if (previousOriginals === undefined) delete process.env.MEDIA_ORIGINALS_DIR;
      else process.env.MEDIA_ORIGINALS_DIR = previousOriginals;
      await rm(originals, { recursive: true, force: true });
    }
  });

  it('reports operations status to the monitor and shares the DaData budget', async () => {
    const token = 'e2e-ops-status-token-'.padEnd(40, '0');
    const saved = {
      OPS_STATUS_TOKEN: process.env.OPS_STATUS_TOKEN,
      DADATA_API_KEY: process.env.DADATA_API_KEY,
      DADATA_DAILY_LIMIT: process.env.DADATA_DAILY_LIMIT,
    };
    const originalFetch = global.fetch;
    // Neither the real S3 bucket nor DaData is called from the tests.
    const probe = jest
      .spyOn(app!.get(CatalogImagesService), 'probeStorage')
      .mockResolvedValue({ bucket: null, originals: null });
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ suggestions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as typeof fetch;
    const status = () =>
      request(app!.getHttpServer()).get('/ops/status').set('Authorization', `Bearer ${token}`);
    try {
      delete process.env.OPS_STATUS_TOKEN;
      await request(app!.getHttpServer()).get('/ops/status').expect(404);
      process.env.OPS_STATUS_TOKEN = token;
      await request(app!.getHttpServer())
        .get('/ops/status')
        .set('Authorization', 'Bearer wrong')
        .expect(401);

      await prisma.operationHeartbeat.deleteMany();
      const stale = await status().expect(200);
      expect(stale.body).toMatchObject({
        status: 'fail',
        checks: { database: { status: 'ok' }, backup: { status: 'fail' } },
      });
      await prisma.operationHeartbeat.create({
        data: { name: 'backup', succeededAt: new Date(), details: { archive: 'e2e.dump' } },
      });
      expect((await status().expect(200)).body).toMatchObject({
        checks: { backup: { status: 'ok' }, storage: { status: 'ok' } },
      });

      process.env.DADATA_API_KEY = 'e2e-key';
      process.env.DADATA_DAILY_LIMIT = '1';
      const suggest = (query: string) =>
        request(app!.getHttpServer()).get('/address/suggestions').query({ query });
      await suggest(`Первый адрес ${randomUUID()}`).expect(200);
      await suggest(`Второй адрес ${randomUUID()}`).expect(503);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((await status().expect(200)).body).toMatchObject({
        checks: { dadata: { status: 'fail', used: 2, limit: 1 } },
      });
    } finally {
      global.fetch = originalFetch;
      probe.mockRestore();
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('answers 400 instead of 500 for out-of-range pages and malformed journal dates', async () => {
    const crmToken = await createSession((await createUser(UserRole.MANAGER)).id, 'CRM');
    const boToken = await createSession((await createUser(UserRole.ADMIN)).id, 'BACKOFFICE');

    for (const path of [
      '/customers?page=99999999999',
      '/requests?page=99999999999',
      '/customers/unknown?page=99999999999',
      '/requests/unknown?commentsPage=99999999999',
    ])
      await authenticatedGet(path, crmToken).expect(400);
    await authenticatedGet('/customers?page=10000', crmToken).expect(200);
    for (const path of [
      '/backoffice/products?page=99999999999&pageSize=25',
      '/backoffice/categories?page=99999999999&pageSize=25',
      '/backoffice/activities?page=99999999999',
      '/backoffice/activities?dateFrom=2026-09-01T10:00:00Z',
      '/backoffice/activities?dateTo=2026-02-30',
    ])
      await authenticatedGet(path, boToken).expect(400);
    const journal = await authenticatedGet(
      '/backoffice/activities?dateFrom=2026-09-01&dateTo=2026-09-30',
      boToken,
    ).expect(200);
    expect(journal.body as unknown).toMatchObject({ page: 0 });

    // The public catalog clamps instead of failing a crawler's deep link.
    const catalog = await request(app!.getHttpServer())
      .get('/catalog/products/page?page=99999999999')
      .expect(200);
    expect((catalog.body as { page: number }).page).toBe(1_000);
  });

  it('exposes user logins to Back Office administrators', async () => {
    const admin = await createUser(UserRole.ADMIN);
    const manager = await createUser(UserRole.MANAGER);
    const token = await createSession(admin.id, 'BACKOFFICE');

    const users = await authenticatedGet('/backoffice/users', token).expect(200);
    expect(users.body as unknown).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: manager.id, login: manager.login })]),
    );
    const updated = await request(app!.getHttpServer())
      .patch(`/backoffice/users/${manager.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Переименованный менеджер' })
      .expect(200);
    expect(updated.body as unknown).toMatchObject({ login: manager.login });
  });

  it('requires explicit conflict resolution and preserves merge contact snapshots', async () => {
    const targetIdentity = nextIdentity();
    const sourceIdentity = nextIdentity();
    const target = await prisma.customer.create({
      data: {
        firstName: 'Анна',
        lastName: 'Иванова',
        middleName: 'Петровна',
        phone: targetIdentity.phone,
        normalizedPhone: targetIdentity.normalizedPhone,
        email: targetIdentity.email,
        normalizedEmail: targetIdentity.email,
        company: 'Альфа',
      },
    });
    const source = await prisma.customer.create({
      data: {
        firstName: 'Мария',
        lastName: 'Сидорова',
        middleName: 'Игоревна',
        phone: sourceIdentity.phone,
        normalizedPhone: sourceIdentity.normalizedPhone,
        email: sourceIdentity.email,
        normalizedEmail: sourceIdentity.email,
        company: 'Бета',
      },
    });
    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');

    await request(app!.getHttpServer())
      .post(`/customers/${target.id}/merge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceCustomerId: source.id })
      .expect(400);
    expect(await prisma.customer.count({ where: { id: { in: [target.id, source.id] } } })).toBe(2);

    await request(app!.getHttpServer())
      .post(`/customers/${target.id}/merge`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceCustomerId: source.id,
        firstNameSelection: 'TARGET',
        lastNameSelection: 'SOURCE',
        middleNameSelection: 'TARGET',
        phoneSelection: 'SOURCE',
        emailSelection: 'TARGET',
        companySelection: 'SOURCE',
      })
      .expect(201);

    expect(await prisma.customer.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      firstName: target.firstName,
      lastName: source.lastName,
      middleName: target.middleName,
      phone: source.phone,
      normalizedPhone: source.normalizedPhone,
      email: target.email,
      company: source.company,
    });
    const mergeActivity = await prisma.customerActivity.findFirstOrThrow({
      where: { customerId: target.id, type: CustomerActivityType.MERGED },
      orderBy: { createdAt: 'desc' },
    });
    expect(mergeActivity.data).toMatchObject({
      sourceCustomerId: source.id,
      sourceContact: {
        firstName: source.firstName,
        phone: source.phone,
        email: source.email,
        company: source.company,
      },
      targetContactBefore: {
        firstName: target.firstName,
        phone: target.phone,
        email: target.email,
        company: target.company,
      },
      mergedContact: {
        firstName: target.firstName,
        lastName: source.lastName,
        phone: source.phone,
        email: target.email,
        company: source.company,
      },
    });
  });

  it('isolates CRM and Back Office sessions', async () => {
    const user = await createUser(UserRole.ADMIN);
    const crmToken = await createSession(user.id, 'CRM');
    const backofficeToken = await createSession(user.id, 'BACKOFFICE');

    await authenticatedGet('/requests', crmToken).expect(200);
    await authenticatedGet('/backoffice/me', crmToken).expect(403);
    await authenticatedGet('/backoffice/me', backofficeToken).expect(200);
    await authenticatedGet('/requests', backofficeToken).expect(403);
  });

  it('accepts only one competing status transition', async () => {
    const identity = nextIdentity();
    const created = await postCustom(publicPayload(identity), `status-${randomUUID()}`).expect(201);
    const createdRequest = await prisma.request.findUniqueOrThrow({
      where: { number: receiptNumber(created.body as unknown) },
    });
    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');

    const responses = await Promise.all([
      updateStatus(createdRequest.id, token, RequestStatus.IN_PROGRESS),
      updateStatus(createdRequest.id, token, RequestStatus.IN_PROGRESS),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
    expect(
      await prisma.requestActivity.count({
        where: {
          requestId: createdRequest.id,
          type: RequestActivityType.STATUS_CHANGED,
        },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.request.findUniqueOrThrow({
          where: { id: createdRequest.id },
        })
      ).firstRespondedAt,
    ).not.toBeNull();
  });

  it('paginates request comments, activities, and consents independently', async () => {
    const identity = nextIdentity();
    const created = await postCustom(publicPayload(identity), `history-${randomUUID()}`).expect(
      201,
    );
    const createdRequest = await prisma.request.findUniqueOrThrow({
      where: { number: receiptNumber(created.body as unknown) },
    });
    await Promise.all([
      prisma.requestComment.createMany({
        data: Array.from({ length: 12 }, (_, index) => ({
          requestId: createdRequest.id,
          text: `Комментарий ${index + 1}`,
        })),
      }),
      prisma.requestActivity.createMany({
        data: Array.from({ length: 12 }, (_, index) => ({
          requestId: createdRequest.id,
          type: RequestActivityType.COMMENT_ADDED,
          data: { text: `Действие ${index + 1}` },
        })),
      }),
      prisma.consent.createMany({
        data: Array.from({ length: 12 }, (_, index) => ({
          requestId: createdRequest.id,
          type: ConsentType.PERSONAL_DATA,
          documentVersion: `e2e-${index + 1}`,
          documentHash: DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
          source: ConsentSource.WEB_FORM,
        })),
      }),
    ]);
    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');

    const response = await authenticatedGet(
      `/requests/${createdRequest.id}?commentsPage=2&activitiesPage=2&consentsPage=2&historyLimit=5`,
      token,
    ).expect(200);
    const body: unknown = response.body;
    if (!body || typeof body !== 'object') throw new Error('Expected request details.');
    const comments = 'comments' in body ? body.comments : null;
    const activities = 'activities' in body ? body.activities : null;
    const consents = 'consents' in body ? body.consents : null;

    expect(comments).toHaveLength(5);
    expect(activities).toHaveLength(5);
    expect(consents).toHaveLength(5);
    expect('historyPagination' in body ? body.historyPagination : null).toMatchObject({
      comments: { page: 2, limit: 5, total: 12, totalPages: 3 },
      activities: { page: 2, limit: 5, total: 13, totalPages: 3 },
      consents: { page: 2, limit: 5, total: 13, totalPages: 3 },
    });
  });

  it('tracks unread state and overdue SLA for the current CRM user', async () => {
    const identity = nextIdentity();
    const created = await postCustom(publicPayload(identity), `attention-${randomUUID()}`).expect(
      201,
    );
    const createdRequest = await prisma.request.findUniqueOrThrow({
      where: { number: receiptNumber(created.body as unknown) },
    });
    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');

    const unreadBefore = await authenticatedGet(
      '/requests?attention=unread&limit=100',
      token,
    ).expect(200);
    expect(requestIds(unreadBefore.body as unknown)).toContain(createdRequest.id);

    await request(app!.getHttpServer())
      .post(`/requests/${createdRequest.id}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const unreadAfter = await authenticatedGet(
      '/requests?attention=unread&limit=100',
      token,
    ).expect(200);
    expect(requestIds(unreadAfter.body as unknown)).not.toContain(createdRequest.id);

    await prisma.request.update({
      where: { id: createdRequest.id },
      data: { responseDueAt: new Date(Date.now() - 60_000) },
    });
    const overdue = await authenticatedGet('/requests?attention=overdue&limit=100', token).expect(
      200,
    );
    expect(requestIds(overdue.body as unknown)).toContain(createdRequest.id);

    const stats = await authenticatedGet('/requests/stats', token).expect(200);
    const statsBody: unknown = stats.body;
    if (!statsBody || typeof statsBody !== 'object') throw new Error('Expected CRM statistics.');
    expect('total' in statsBody && typeof statsBody.total).toBe('number');
    expect('unread' in statsBody && typeof statsBody.unread).toBe('number');
    expect('overdue' in statsBody && typeof statsBody.overdue).toBe('number');
  });

  it('sorts customers by their latest request instead of customer.updatedAt', async () => {
    const marker = `sort-${randomUUID()}`;
    const olderRequestCustomer = await prisma.customer.create({
      data: {
        firstName: 'Старшая карточка',
        lastName: 'Клиент',
        phone: `+7${randomUUID().replace(/\D/g, '').padEnd(10, '1').slice(0, 10)}`,
        company: marker,
      },
    });
    const newerRequestCustomer = await prisma.customer.create({
      data: {
        firstName: 'Свежая заявка',
        lastName: 'Клиент',
        phone: `+7${randomUUID().replace(/\D/g, '').padEnd(10, '2').slice(0, 10)}`,
        company: marker,
      },
    });
    const olderRequestAt = new Date('2026-01-01T00:00:00.000Z');
    const newerRequestAt = new Date('2026-08-01T00:00:00.000Z');
    await prisma.request.createMany({
      data: [
        {
          type: RequestType.CUSTOM,
          customerId: olderRequestCustomer.id,
          firstName: olderRequestCustomer.firstName,
          lastName: olderRequestCustomer.lastName,
          phone: olderRequestCustomer.phone,
          company: marker,
          createdAt: olderRequestAt,
        },
        {
          type: RequestType.CUSTOM,
          customerId: newerRequestCustomer.id,
          firstName: newerRequestCustomer.firstName,
          lastName: newerRequestCustomer.lastName,
          phone: newerRequestCustomer.phone,
          company: marker,
          createdAt: newerRequestAt,
        },
      ],
    });
    await prisma.customer.update({
      where: { id: olderRequestCustomer.id },
      data: { updatedAt: new Date('2026-09-01T00:00:00.000Z') },
    });
    await prisma.customer.update({
      where: { id: newerRequestCustomer.id },
      data: { updatedAt: new Date('2026-02-01T00:00:00.000Z') },
    });
    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');

    const response = await authenticatedGet(
      `/customers?search=${encodeURIComponent(marker)}&sortBy=lastActivity&sortOrder=desc`,
      token,
    ).expect(200);

    expect(requestIds(response.body as unknown)).toEqual([
      newerRequestCustomer.id,
      olderRequestCustomer.id,
    ]);
  });

  it('keeps the stored last request date current on every write path', async () => {
    const marker = `last-${randomUUID()}`;
    const phone = () => `+7${randomUUID().replace(/\D/g, '').padEnd(10, '3').slice(0, 10)}`;
    // Distinct creation dates: equal request dates are ordered by the card's createdAt.
    const cards = [];
    for (const [index, firstName] of ['Первый', 'Второй', 'Без заявок'].entries())
      cards.push(
        await prisma.customer.create({
          data: {
            firstName,
            lastName: 'Клиент',
            phone: phone(),
            company: marker,
            createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
          },
        }),
      );
    const [first, second, withoutRequests] = cards as [
      (typeof cards)[number],
      (typeof cards)[number],
      (typeof cards)[number],
    ];
    const addRequest = (customerId: string, createdAt: string) =>
      prisma.request.create({
        data: {
          type: RequestType.CUSTOM,
          customerId,
          firstName: 'Клиент',
          lastName: 'Клиент',
          phone: phone(),
          createdAt: new Date(createdAt),
        },
      });
    const lastRequestAt = async (id: string) =>
      (await prisma.customer.findUniqueOrThrow({ where: { id } })).lastRequestAt?.toISOString() ??
      null;

    await addRequest(first.id, '2026-03-01T00:00:00.000Z');
    await addRequest(second.id, '2026-06-01T00:00:00.000Z');
    // An older request never moves the date back.
    await addRequest(second.id, '2026-01-01T00:00:00.000Z');
    expect(await lastRequestAt(first.id)).toBe('2026-03-01T00:00:00.000Z');
    expect(await lastRequestAt(second.id)).toBe('2026-06-01T00:00:00.000Z');
    expect(await lastRequestAt(withoutRequests.id)).toBeNull();

    // A merge moves the requests of one card to another.
    await prisma.request.updateMany({
      where: { customerId: second.id },
      data: { customerId: first.id },
    });
    expect(await lastRequestAt(first.id)).toBe('2026-06-01T00:00:00.000Z');

    const token = await createSession((await createUser(UserRole.MANAGER)).id, 'CRM');
    const list = await authenticatedGet(
      `/customers?search=${encodeURIComponent(marker)}&sortBy=lastActivity&sortOrder=desc`,
      token,
    ).expect(200);
    expect(
      (
        list.body as {
          data: Array<{ id: string; lastActivity: string | null; requestCount: number }>;
        }
      ).data.map(({ id, lastActivity, requestCount }) => ({ id, lastActivity, requestCount })),
    ).toEqual([
      // Equal dates: the newer card first; without requests: last.
      { id: second.id, lastActivity: '2026-06-01T00:00:00.000Z', requestCount: 0 },
      { id: first.id, lastActivity: '2026-06-01T00:00:00.000Z', requestCount: 3 },
      { id: withoutRequests.id, lastActivity: null, requestCount: 0 },
    ]);
  });

  it('lets an authenticated user replace recovery codes and invalidates the previous set', async () => {
    const user = await createUser(UserRole.MANAGER);
    const token = await createSession(user.id, 'CRM');
    const obsoleteHash = createHash('sha256').update('recovery:OBSOLETE-CODE').digest('hex');
    await prisma.authRecoveryCode.create({ data: { userId: user.id, codeHash: obsoleteHash } });

    const firstResponse = await request(app!.getHttpServer())
      .post('/auth/recovery-codes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Application', 'CRM')
      .expect(201);
    const firstCodes = recoveryCodes(firstResponse.body as unknown);
    const firstHashes = firstCodes.map((code) =>
      createHash('sha256').update(`recovery:${code}`).digest('hex'),
    );

    expect(firstCodes).toHaveLength(8);
    await expect(
      prisma.authRecoveryCode.count({ where: { userId: user.id, codeHash: obsoleteHash } }),
    ).resolves.toBe(0);
    await expect(
      prisma.authRecoveryCode.count({ where: { userId: user.id, codeHash: { in: firstHashes } } }),
    ).resolves.toBe(8);

    const secondResponse = await request(app!.getHttpServer())
      .post('/auth/recovery-codes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Application', 'CRM')
      .expect(201);
    expect(recoveryCodes(secondResponse.body as unknown)).toHaveLength(8);
    await expect(
      prisma.authRecoveryCode.count({ where: { userId: user.id, codeHash: { in: firstHashes } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.backofficeActivity.count({
        where: { userId: user.id, action: 'AUTH_RECOVERY_CODES_REGENERATED' },
      }),
    ).resolves.toBe(2);
  });

  it('shares one 2FA budget across concurrent challenges and locks the account', async () => {
    const user = await createUser(UserRole.MANAGER);
    const accountKey = createHash('sha256').update(`two-factor-account:${user.id}`).digest('hex');
    const challenges = await Promise.all([1, 2, 3].map(() => createChallenge(user.id, 'CRM')));

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        verifyCode(challenges[index % challenges.length], `WRONG-${index}`),
      ),
    );

    const lockedResponses = responses.filter(
      (response) => (response.body as { code?: string }).code === 'TWO_FACTOR_ACCOUNT_LOCKED',
    );
    // Nine free attempts, the tenth sets the lock; the rest never reach the code check.
    expect(lockedResponses.length).toBeGreaterThanOrEqual(1);
    expect(responses.every((response) => [401, 429].includes(response.status))).toBe(true);
    const attempt = await prisma.loginAttempt.findUniqueOrThrow({ where: { key: accountKey } });
    expect(attempt.failureCount).toBe(10);
    const lockSeconds = (attempt.lockedUntil!.getTime() - Date.now()) / 1000;
    expect(lockSeconds).toBeGreaterThan(45);
    expect(lockSeconds).toBeLessThanOrEqual(61);

    const recoveryCode = 'VALID-CODE2';
    await prisma.authRecoveryCode.create({
      data: {
        userId: user.id,
        codeHash: createHash('sha256').update(`recovery:${recoveryCode}`).digest('hex'),
      },
    });
    const lockedChallenge = await createChallenge(user.id, 'CRM');
    const locked = await verifyCode(lockedChallenge, recoveryCode).expect(429);
    expect(locked.body).toMatchObject({ code: 'TWO_FACTOR_ACCOUNT_LOCKED' });
    await expect(
      prisma.authRecoveryCode.count({ where: { userId: user.id, usedAt: null } }),
    ).resolves.toBe(1);
    await expect(
      prisma.backofficeActivity.count({
        where: { userId: user.id, action: 'AUTH_TWO_FACTOR_ACCOUNT_LOCKED' },
      }),
    ).resolves.toBe(1);

    await prisma.loginAttempt.update({
      where: { key: accountKey },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const wrongAfterLock = await verifyCode(await createChallenge(user.id, 'CRM'), 'WRONG-AGAIN');
    expect(wrongAfterLock.status).toBe(429);
    const doubled = await prisma.loginAttempt.findUniqueOrThrow({ where: { key: accountKey } });
    expect(doubled.failureCount).toBe(11);
    expect((doubled.lockedUntil!.getTime() - Date.now()) / 1000).toBeGreaterThan(105);

    await prisma.loginAttempt.update({
      where: { key: accountKey },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await verifyCode(await createChallenge(user.id, 'CRM'), recoveryCode).expect(201);
    await expect(prisma.loginAttempt.count({ where: { key: accountKey } })).resolves.toBe(0);
  });

  it('backs off password guessing per account and upgrades legacy hashes on login', async () => {
    const id = randomUUID();
    const salt = randomBytes(16).toString('hex');
    const legacyHash = `${salt}:${scryptSync('correct-password', salt, 64).toString('hex')}`;
    const user = await prisma.user.create({
      data: {
        name: 'E2E password',
        login: `e2e-pw-${id}`,
        passwordHash: legacyHash,
        role: UserRole.MANAGER,
      },
    });
    const accountKey = createHash('sha256').update(`login-account:${user.login}`).digest('hex');
    const login = (password: string) =>
      request(app!.getHttpServer())
        .post('/auth/login')
        .set('X-Application', 'CRM')
        .send({ login: user.login, password });

    for (let attempt = 1; attempt <= 5; attempt += 1) await login('wrong-password').expect(401);
    const locked = await login('correct-password').expect(429);
    expect(locked.body).toMatchObject({ code: 'LOGIN_ACCOUNT_LOCKED' });
    const lock = await prisma.loginAttempt.findUniqueOrThrow({ where: { key: accountKey } });
    expect(lock.failureCount).toBe(5);
    expect((lock.lockedUntil!.getTime() - Date.now()) / 1000).toBeGreaterThan(45);
    await expect(
      prisma.backofficeActivity.count({
        where: { userId: user.id, action: 'AUTH_LOGIN_ACCOUNT_LOCKED' },
      }),
    ).resolves.toBe(1);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
      passwordHash: legacyHash,
    });

    await prisma.loginAttempt.update({
      where: { key: accountKey },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await login('correct-password').expect(201);
    await expect(prisma.loginAttempt.count({ where: { key: accountKey } })).resolves.toBe(0);
    const upgraded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(upgraded.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
    await login('correct-password').expect(201);
  });

  it('backs off an unknown login exactly like a real one', async () => {
    const login = `e2e-missing-${randomUUID()}`;
    for (let attempt = 1; attempt <= 5; attempt += 1)
      await request(app!.getHttpServer())
        .post('/auth/login')
        .set('X-Application', 'CRM')
        .send({ login, password: 'guess' })
        .expect(401);
    const locked = await request(app!.getHttpServer())
      .post('/auth/login')
      .set('X-Application', 'CRM')
      .send({ login, password: 'guess' })
      .expect(429);
    expect(locked.body).toMatchObject({ code: 'LOGIN_ACCOUNT_LOCKED' });
  });

  it('checks the Back Office role only after the second factor', async () => {
    const manager = await createUser(UserRole.MANAGER);
    const recoveryCode = 'MANAG-ERCD3';
    await prisma.authRecoveryCode.create({
      data: {
        userId: manager.id,
        codeHash: createHash('sha256').update(`recovery:${recoveryCode}`).digest('hex'),
      },
    });
    const challenge = await createChallenge(manager.id, 'BACKOFFICE');

    await verifyCode(challenge, 'WRONG-CODE').expect(401);
    const forbidden = await verifyCode(challenge, recoveryCode).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'APPLICATION_FORBIDDEN' });
    await expect(prisma.authSession.count({ where: { userId: manager.id } })).resolves.toBe(0);
    await expect(
      prisma.authTwoFactorChallenge.count({ where: { userId: manager.id } }),
    ).resolves.toBe(0);
  });

  it('exposes liveness and PostgreSQL readiness endpoints', async () => {
    const requestId = `e2e-health-${randomUUID()}`;
    const health = await request(app!.getHttpServer())
      .get('/health')
      .set('X-Request-Id', requestId)
      .expect(200)
      .expect({ status: 'ok' });
    expect(health.headers['x-request-id']).toBe(requestId);

    await request(app!.getHttpServer())
      .get('/ready')
      .expect(200)
      .expect({ status: 'ok', checks: { database: 'up' } });
  });

  it('hides bootstrap configuration after the first user exists', async () => {
    await createUser(UserRole.ADMIN);

    const response = await request(app!.getHttpServer()).get('/auth/bootstrap-status').expect(404);

    expect(JSON.stringify(response.body as unknown)).not.toContain('setupSecretConfigured');
  });

  it('returns a request ID for safe 500 responses and redacts error logs', async () => {
    const metricsBefore = await request(app!.getHttpServer()).get('/metrics').expect(200);
    const countBefore = serverErrorMetric(metricsBefore.text);
    const requestId = `e2e-failure-${randomUUID()}`;
    const response = await request(app!.getHttpServer())
      .get('/__e2e/failure')
      .set('X-Request-Id', requestId)
      .expect(500);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Внутренняя ошибка сервера.',
      requestId,
    });

    const errorLog = logLines.find((line) => line.includes('http.request.failed'));
    expect(errorLog).toBeDefined();
    expect(errorLog).not.toContain('private@example.test');
    expect(errorLog).not.toContain('999) 123-45-67');
    expect(errorLog).not.toContain('secret-token-value');

    const metricsAfter = await request(app!.getHttpServer()).get('/metrics').expect(200);
    expect(metricsAfter.headers['content-type']).toMatch(/^text\/plain/);
    expect(serverErrorMetric(metricsAfter.text)).toBe(countBefore + 1);
  });

  it('does not expose the message of an HTTP 500 exception', async () => {
    const response = await request(app!.getHttpServer()).get('/__e2e/http-failure').expect(500);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Внутренняя ошибка сервера.',
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(response.body)).not.toContain('private@example.test');
  });

  // Solves a fresh CAPTCHA unless the payload brings its own `altcha`
  // (null: send without one). Awaitable and chainable like a supertest request.
  function postCustom(
    payload: ReturnType<typeof publicPayload> & { website?: string; altcha?: string | null },
    key: string,
  ) {
    // Wrapped: an async function would otherwise send the thenable request itself.
    const prepared = (async () => {
      const { altcha, ...body } = payload;
      const captcha = altcha === undefined ? await solvedCaptcha() : altcha;
      return {
        test: request(app!.getHttpServer())
          .post('/requests/custom')
          .set('Idempotency-Key', key)
          .send(captcha === null ? body : { ...body, altcha: captcha }),
      };
    })();
    return Object.assign(
      prepared.then(({ test }) => test),
      { expect: (status: number) => prepared.then(({ test }) => test.expect(status)) },
    );
  }

  async function solvedCaptcha() {
    const response = await request(app!.getHttpServer()).get('/requests/challenge').expect(200);
    const challenge = response.body as Challenge;
    const solution = await solveChallenge({ challenge, deriveKey });
    return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
  }

  async function metricsText() {
    const response = await request(app!.getHttpServer()).get('/metrics').expect(200);
    return response.text;
  }

  function rejectionMetric(metrics: string, reason: string) {
    const match = metrics.match(
      new RegExp(
        `^gidravlika_public_request_rejections_total\\{reason="${reason}"\\} (\\d+)$`,
        'm',
      ),
    );
    if (!match) throw new Error(`Expected the ${reason} rejection counter in Prometheus metrics.`);
    return Number(match[1]);
  }

  function serverErrorMetric(metrics: string) {
    const match = metrics.match(/^gidravlika_http_server_error_responses_total (\d+)$/m);
    if (!match) throw new Error('Expected the 5xx response counter in Prometheus metrics.');
    return Number(match[1]);
  }

  function receiptCreatedAt(value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('createdAt' in value) ||
      typeof value.createdAt !== 'string'
    ) {
      throw new Error('Expected a receipt creation date.');
    }
    return value.createdAt;
  }

  function authenticatedGet(path: string, token: string) {
    return request(app!.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  function updateStatus(id: string, token: string, status: RequestStatus) {
    return request(app!.getHttpServer())
      .patch(`/requests/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });
  }

  async function createUser(role: UserRole) {
    const id = randomUUID();
    return prisma.user.create({
      data: {
        name: `E2E ${role}`,
        login: `e2e-${id}`,
        passwordHash: 'not-used-by-e2e',
        role,
      },
    });
  }

  async function createSession(userId: string, application: string) {
    const token = `e2e-${application.toLowerCase()}-${randomUUID()}`;
    await prisma.authSession.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId,
        application,
        twoFactorVerified: true,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return token;
  }

  async function createChallenge(userId: string, application: string) {
    const token = `e2e-challenge-${randomUUID()}`;
    await prisma.authTwoFactorChallenge.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        type: 'VERIFY',
        application,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return token;
  }

  function verifyCode(challengeToken: string, code: string) {
    return request(app!.getHttpServer())
      .post('/auth/two-factor/verify')
      .set('X-Two-Factor-Challenge', challengeToken)
      .send({ code });
  }

  async function expectRequestCount(phone: string, expected: number) {
    expect(await prisma.request.count({ where: { phone } })).toBe(expected);
  }

  function nextIdentity() {
    sequence += 1;
    const suffix = String(sequence).padStart(4, '0');
    return {
      phone: `+7 989 900-${suffix.slice(0, 2)}-${suffix.slice(2)}`,
      normalizedPhone: `+7989900${suffix}`,
      email: `e2e-${suffix}@example.test`,
    };
  }

  function publicPayload(
    identity: ReturnType<typeof nextIdentity>,
    overrides: Partial<{
      firstName: string;
      lastName: string;
      company: string;
      documentVersion: string;
    }> = {},
  ) {
    return {
      firstName: overrides.firstName ?? 'Тест',
      lastName: overrides.lastName ?? 'Интеграционный',
      middleName: 'Проверочный',
      phone: identity.phone,
      email: identity.email,
      company: overrides.company ?? 'E2E',
      comment: 'Проверка критического сценария',
      personalDataConsent: true as const,
      documentVersion: overrides.documentVersion ?? DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
    };
  }

  function receiptNumber(body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      !('number' in body) ||
      typeof body.number !== 'string'
    ) {
      throw new Error('Expected a public request receipt.');
    }
    return body.number;
  }

  function requestIds(body: unknown): string[] {
    if (!body || typeof body !== 'object' || !('data' in body)) return [];
    const data = (body as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    const items = data as unknown[];
    return items.flatMap((item) =>
      item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
        ? [item.id]
        : [],
    );
  }

  function potentialDuplicateIds(body: unknown): string[] {
    if (!body || typeof body !== 'object' || !('potentialDuplicates' in body)) return [];
    const duplicates = (body as { potentialDuplicates?: unknown }).potentialDuplicates;
    if (!Array.isArray(duplicates)) return [];
    const items = duplicates as unknown[];
    return items.flatMap((duplicate) =>
      duplicate &&
      typeof duplicate === 'object' &&
      'id' in duplicate &&
      typeof duplicate.id === 'string'
        ? [duplicate.id]
        : [],
    );
  }

  function recoveryCodes(body: unknown): string[] {
    if (!body || typeof body !== 'object' || !('recoveryCodes' in body)) return [];
    const codes = (body as { recoveryCodes?: unknown }).recoveryCodes;
    return Array.isArray(codes)
      ? codes.filter((code): code is string => typeof code === 'string')
      : [];
  }

  function catalogItems(body: unknown): unknown[] {
    if (!body || typeof body !== 'object' || !('items' in body)) return [];
    const items = (body as { items?: unknown }).items;
    return Array.isArray(items) ? (items as unknown[]) : [];
  }

  // ARCH-01: the operations no other scenario reaches, so that the contract
  // check below sees them too. Media uploads stay out: they need real S3.
  it('walks the remaining API operations for the contract check', async () => {
    const server = app!.getHttpServer();
    const admin = await createUser(UserRole.ADMIN);
    const crm = await createSession(admin.id, 'CRM');
    const backoffice = await createSession(admin.id, 'BACKOFFICE');
    const asAdmin = <T extends request.Test>(test: T) =>
      test.set('Authorization', `Bearer ${backoffice}`);

    const category = await prisma.category.create({
      data: { name: 'Контракт', slug: `contract-${randomUUID()}` },
    });
    const product = await prisma.product.create({
      data: {
        sku: `CONTRACT-${sequence}`,
        name: 'Гидроцилиндр контрактный',
        slug: `contract-${randomUUID()}`,
        price: new Prisma.Decimal('1500.50'),
        maxPressureMpa: new Prisma.Decimal('16.00'),
        stockQuantity: 3,
        categoryId: category.id,
      },
    });
    await request(server).get('/catalog/categories').expect(200);
    await request(server).get('/catalog/products').expect(200);
    await request(server).get('/catalog/products/sitemap').expect(200);
    await request(server).get('/site-media').expect(200);

    const buyer = nextIdentity();
    await request(server)
      .post('/requests/cart')
      .set('Idempotency-Key', randomUUID())
      .send({
        ...publicPayload(buyer),
        altcha: await solvedCaptcha(),
        // A DaData suggestion: missing parts are null and are not stored.
        deliveryType: 'DELIVERY',
        deliveryAddress: 'г Орёл, ул Ленина, д 1',
        deliveryAddressDetails: { city: 'Орёл', street: 'Ленина', house: '1', flat: null },
        paymentType: 'BANK_TRANSFER',
        items: [{ productId: product.id, quantity: 2 }],
      })
      .expect(201);
    await request(server)
      .post('/requests/wholesale')
      .set('Idempotency-Key', randomUUID())
      .send({ ...publicPayload(nextIdentity()), altcha: await solvedCaptcha() })
      .expect(201);
    const cartRequest = await prisma.request.findFirstOrThrow({
      where: { phone: buyer.phone, type: RequestType.CART },
    });
    const cartDetails = await authenticatedGet(`/requests/${cartRequest.id}`, crm).expect(200);
    expect(
      (cartDetails.body as { cartRequest: { deliveryAddressDetails: unknown } }).cartRequest
        .deliveryAddressDetails,
    ).toEqual({ city: 'Орёл', street: 'Ленина', house: '1' });
    await request(server)
      .post(`/requests/${cartRequest.id}/comments`)
      .set('Authorization', `Bearer ${crm}`)
      .send({ text: 'Проверка контракта' })
      .expect(201);
    const customerId = cartRequest.customerId!;
    await authenticatedGet(`/customers/${customerId}/personal-data`, crm).expect(200);
    await request(server)
      .post(`/customers/${customerId}/anonymize`)
      .set('Authorization', `Bearer ${crm}`)
      .send({ reason: 'Проверка контракта', confirmation: 'ОБЕЗЛИЧИТЬ' })
      .expect(201);

    // First login of a user without 2FA: the setup challenge with the QR code.
    const password = 'contract-password-2026';
    const newcomer = await prisma.user.create({
      data: {
        name: 'E2E newcomer',
        login: `e2e-${randomUUID()}`,
        passwordHash: await hashPassword(password),
      },
    });
    const login = await request(server)
      .post('/auth/login')
      .set('X-Application', 'CRM')
      .send({ login: newcomer.login, password })
      .expect(201);
    await request(server)
      .get('/auth/two-factor/challenge')
      .set('X-Two-Factor-Challenge', (login.body as { challengeToken: string }).challengeToken)
      .expect(200);
    await authenticatedGet('/auth/me', crm).set('X-Application', 'CRM').expect(200);

    await asAdmin(request(server).get(`/backoffice/products/${product.id}`)).expect(200);
    await asAdmin(request(server).get('/backoffice/settings')).expect(200);
    await asAdmin(request(server).get('/backoffice/server-resources')).expect(200);
    await asAdmin(request(server).get('/backoffice/media')).expect(200);
    await asAdmin(request(server).patch('/backoffice/products/bulk'))
      .send({ ids: [product.id], isFeatured: true })
      .expect(200);
    const created = await asAdmin(request(server).post('/backoffice/categories'))
      .send({ name: 'Контракт дочерняя', slug: `contract-${randomUUID()}`, parentId: category.id })
      .expect(201);
    await asAdmin(request(server).patch('/backoffice/categories/bulk'))
      .send({ ids: [(created.body as { id: string }).id], isActive: false })
      .expect(200);
    await asAdmin(request(server).delete(`/backoffice/products/${product.id}`)).expect(200);

    const staff = await asAdmin(request(server).post('/backoffice/users'))
      .send({ name: 'E2E staff', login: `e2e-${sequence}-staff`, password, role: 'MANAGER' })
      .expect(201);
    const staffId = (staff.body as { id: string }).id;
    const staffSession = await createSession(staffId, 'CRM');
    const sessions = await asAdmin(
      request(server).get(`/backoffice/users/${staffId}/sessions`),
    ).expect(200);
    await asAdmin(
      request(server).post(
        `/backoffice/users/${staffId}/sessions/${(sessions.body as Array<{ id: string }>)[0].id}/revoke`,
      ),
    ).expect(201);
    await asAdmin(request(server).patch(`/backoffice/users/${staffId}/password`))
      .send({ password: `${password}-new` })
      .expect(200);
    await asAdmin(request(server).post(`/backoffice/users/${staffId}/reset-two-factor`)).expect(
      201,
    );
    await asAdmin(request(server).post(`/backoffice/users/${staffId}/revoke-sessions`)).expect(201);
    await authenticatedGet('/auth/me', staffSession).set('X-Application', 'CRM').expect(401);

    await request(server).post('/auth/logout').set('Authorization', `Bearer ${crm}`).expect(201);
  });

  // Last on purpose: checks every JSON answer the tests above received (ARCH-01).
  it('answers every request as the OpenAPI contract describes', () => {
    expect(contract.count).toBeGreaterThan(100);
    expect(contract.problems()).toEqual([]);
  });
});
