/**
 * PERF-01: timings of the CRM list queries on production-like volumes.
 * Run with `pnpm test:perf` (a disposable database, like the E2E tests):
 * 100 000 customers, ~250 000 requests with ~500 000 history entries, read
 * marks of one manager. Prints a
 * report with the median of three runs and EXPLAIN ANALYZE of the customer
 * sort by last activity. Budgets are generous: they catch order-of-magnitude
 * regressions, not machine-to-machine noise.
 */
import { Prisma, UserRole } from '@prisma/client';
import { CustomersService } from '../../src/customers/customers.service';
import { CustomerQueryDto } from '../../src/customers/dto/customer-query.dto';
import { CustomerRequestsQueryDto } from '../../src/customers/dto/customer-requests-query.dto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RequestQueryDto } from '../../src/requests/dto/request-query.dto';
import { RequestsService } from '../../src/requests/requests.service';

const CUSTOMERS = 100_000;
const report: Array<{ query: string; medianMs: number; budgetMs: number }> = [];

describe('CRM queries on 100k customers (PERF-01)', () => {
  const prisma = new PrismaService();
  const customers = new CustomersService(prisma);
  const requests = new RequestsService(prisma);
  let managerId: string;

  beforeAll(async () => {
    const [database] = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database()::text AS "name"
    `;
    if (!database?.name.startsWith('gidravlika_e2e_'))
      throw new Error(
        `Refusing to seed ${database?.name ?? 'unknown'}: not a disposable database.`,
      );

    managerId = (
      await prisma.user.create({
        data: { name: 'Perf', login: 'perf', passwordHash: 'unused', role: UserRole.MANAGER },
      })
    ).id;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Customer" ("id", "firstName", "lastName", "phone", "normalizedPhone",
        "email", "normalizedEmail", "company", "createdAt", "updatedAt")
      SELECT 'c' || g, 'Имя' || (g % 900), 'Фамилия' || (g % 5000),
        '+7 900 ' || lpad(g::text, 7, '0'), '+7900' || lpad(g::text, 7, '0'),
        'user' || g || '@example.test', 'user' || g || '@example.test',
        CASE WHEN g % 3 = 0 THEN 'ООО Компания ' || (g % 700) END,
        now() - make_interval(mins => g), now()
      FROM generate_series(1, ${CUSTOMERS}) AS g
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Request" ("id", "number", "type", "status", "customerId", "firstName",
        "lastName", "phone", "email", "createdAt", "updatedAt", "responseDueAt")
      SELECT 'r' || g || '-' || k, 'N' || g || '-' || k,
        (ARRAY['CART', 'CUSTOM', 'WHOLESALE'])[1 + (g + k) % 3]::"RequestType",
        (ARRAY['NEW', 'IN_PROGRESS', 'CONTACTED', 'COMPLETED', 'CANCELLED'])[1 + (g * k) % 5]::"RequestStatus",
        'c' || g, 'Имя' || (g % 900), 'Фамилия' || (g % 5000),
        '+7 900 ' || lpad(g::text, 7, '0'), 'user' || g || '@example.test',
        now() - make_interval(mins => (g * 7 + k * 131) % 525600),
        now(), now() + interval '1 hour'
      FROM generate_series(1, ${CUSTOMERS}) AS g, generate_series(1, 1 + g % 4) AS k
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "RequestReadState" ("id", "requestId", "userId", "readAt")
      SELECT 'rs' || r."id", r."id", '${managerId}', now()
      FROM "Request" r WHERE r."sequence" % 2 = 0
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "RequestActivity" ("id", "requestId", "type", "data", "createdAt")
      SELECT 'ra' || r."id" || '-' || k, r."id",
        (ARRAY['REQUEST_CREATED', 'STATUS_CHANGED']::"RequestActivityType"[])[k], '{}', r."createdAt"
      FROM "Request" r, generate_series(1, 2) AS k
    `);
    await prisma.$executeRawUnsafe('ANALYZE');
  });

  afterAll(async () => {
    console.table(report);
    await prisma.$disconnect();
  });

  const customerQuery = (values: Partial<CustomerQueryDto>) =>
    Object.assign(new CustomerQueryDto(), values);
  const requestQuery = (values: Partial<RequestQueryDto>) =>
    Object.assign(new RequestQueryDto(), values);

  it.each([
    ['customers: last activity, page 1', { sortBy: 'lastActivity' }, 100],
    ['customers: last activity, page 2500', { sortBy: 'lastActivity', page: 2_500 }, 300],
    ['customers: last activity, search', { sortBy: 'lastActivity', search: 'Фамилия123' }, 600],
    ['customers: name, page 1', { sortBy: 'name' }, 100],
    ['customers: request count, page 1', { sortBy: 'requestCount' }, 1_500],
    ['customers: broad search', { sortBy: 'name', search: 'example' }, 1_000],
  ] as const)('%s', async (name, values, budgetMs) => {
    const medianMs = await median(() => customers.getCustomers(customerQuery(values)));
    report.push({ query: name, medianMs, budgetMs });
    expect(medianMs).toBeLessThan(budgetMs);
  });

  it.each([
    ['requests: newest, page 1', {}, 300],
    ['requests: newest, page 5000', { page: 5_000 }, 800],
    ['requests: unread', { attention: 'unread' }, 800],
    ['requests: search', { search: 'Фамилия123' }, 500],
  ] as const)('%s', async (name, values, budgetMs) => {
    const medianMs = await median(() => requests.getRequests(requestQuery(values), managerId));
    report.push({ query: name, medianMs, budgetMs });
    expect(medianMs).toBeLessThan(budgetMs);
  });

  it('customers: card', async () => {
    const medianMs = await median(() =>
      customers.getCustomer('c50000', new CustomerRequestsQueryDto()),
    );
    report.push({ query: 'customers: card', medianMs, budgetMs: 100 });
    expect(medianMs).toBeLessThan(100);
  });

  it('requests: card with history', async () => {
    const medianMs = await median(() => requests.getRequest('r50000-1', managerId));
    report.push({ query: 'requests: card with history', medianMs, budgetMs: 100 });
    expect(medianMs).toBeLessThan(100);
  });

  it('requests: dashboard stats', async () => {
    const medianMs = await median(() => requests.getStats(managerId));
    report.push({ query: 'requests: dashboard stats', medianMs, budgetMs: 200 });
    expect(medianMs).toBeLessThan(200);
  });

  it('prints the plan of the last-activity sort', async () => {
    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>(Prisma.sql`
      EXPLAIN (ANALYZE, BUFFERS)
      ${lastActivitySql()}
    `);
    console.log(plan.map((row) => row['QUERY PLAN']).join('\n'));
  });
});

/** The ORDER BY used by CustomersService for sortBy=lastActivity, first page. */
function lastActivitySql() {
  return Prisma.raw(process.env.PERF_LAST_ACTIVITY_SQL ?? DEFAULT_LAST_ACTIVITY_SQL);
}
const DEFAULT_LAST_ACTIVITY_SQL = `
  SELECT c."id" FROM "Customer" c
  ORDER BY c."lastRequestAt" DESC NULLS LAST, c."createdAt" DESC, c."id" ASC
  OFFSET 0 LIMIT 20`;

async function median(run: () => Promise<unknown>) {
  const timings: number[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const startedAt = performance.now();
    await run();
    timings.push(performance.now() - startedAt);
  }
  timings.sort((a, b) => a - b);
  return Math.round(timings[1] ?? 0);
}
