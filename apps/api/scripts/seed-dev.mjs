// Demo data for a local development database (DOC-01): two staff users with
// known passwords, a small catalog, customers and requests of every type.
// Safe to run again — existing demo rows are kept as they are. Refuses to run
// in staging or production and against anything but a local PostgreSQL.
//
//   pnpm db:seed
import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// Test-only credentials, documented in docs/onboarding.md.
const demoPassword = "Demo-Password-2026";
const users = [
  { id: "demo-user-admin", login: "admin", name: "Администратор (демо)", role: "ADMIN" },
  { id: "demo-user-manager", login: "manager", name: "Менеджер (демо)", role: "MANAGER" },
];

const categories = [
  { id: "demo-category-dump", name: "Гидроцилиндры для самосвалов", slug: "demo-samosvaly" },
  { id: "demo-category-trailer", name: "Гидроцилиндры для прицепов", slug: "demo-pricepy" },
  { id: "demo-category-special", name: "Гидроцилиндры для спецтехники", slug: "demo-spectehnika" },
];

const products = [
  [
    "demo-product-1",
    "ДЕМО-0001",
    "Гидроцилиндр подъёма кузова КАМАЗ",
    "demo-dump",
    28600,
    14,
    [110, 50, 620, 880],
  ],
  [
    "demo-product-2",
    "ДЕМО-0002",
    "Гидроцилиндр подъёма кузова НЕФАЗ",
    "demo-dump",
    31400,
    3,
    [125, 55, 700, 965],
  ],
  [
    "demo-product-3",
    "ДЕМО-0003",
    "Телескопический гидроцилиндр МАЗ",
    "demo-dump",
    45200,
    0,
    [140, 63, 1100, 1250],
  ],
  [
    "demo-product-4",
    "ДЕМО-0004",
    "Гидроцилиндр прицепа СЗАП",
    "demo-trailer",
    18900,
    7,
    [100, 45, 500, 740],
  ],
  [
    "demo-product-5",
    "ДЕМО-0005",
    "Гидроцилиндр опрокидывания прицепа",
    "demo-trailer",
    21500,
    1,
    [90, 40, 450, 680],
  ],
  [
    "demo-product-6",
    "ДЕМО-0006",
    "Гидроцилиндр стрелы экскаватора",
    "demo-special",
    56800,
    5,
    [160, 80, 1200, 1650],
  ],
  [
    "demo-product-7",
    "ДЕМО-0007",
    "Гидроцилиндр ковша погрузчика",
    "demo-special",
    38700,
    9,
    [125, 63, 800, 1100],
  ],
  // Hidden from the site until published in the Back Office.
  [
    "demo-product-8",
    "ДЕМО-0008",
    "Гидроцилиндр рулевого управления (черновик)",
    "demo-special",
    12400,
    4,
    [63, 32, 250, 420],
    false,
  ],
];

const customers = [
  [
    "demo-customer-1",
    "Иван",
    "Кузнецов",
    "Петрович",
    "+7 (900) 111-22-33",
    "+79001112233",
    "ivan@example.test",
    "ООО «Стройтранс»",
  ],
  [
    "demo-customer-2",
    "Мария",
    "Соколова",
    "Андреевна",
    "+7 (900) 222-33-44",
    "+79002223344",
    "maria@example.test",
    null,
  ],
  [
    "demo-customer-3",
    "Олег",
    "Волков",
    "Сергеевич",
    "+7 (900) 333-44-55",
    "+79003334455",
    "opt@example.test",
    "АО «Спецмаш»",
  ],
];

const environment = process.env.APP_ENV?.trim() || "development";
if (
  environment === "staging" ||
  environment === "production" ||
  process.env.NODE_ENV === "production"
) {
  fail(`demo data is for local development only (APP_ENV=${environment}).`);
}
if (!process.env.DATABASE_URL) fail("set DATABASE_URL (apps/api/.env).");
const databaseUrl = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
  fail(`demo data goes only into a local PostgreSQL, not ${databaseUrl.hostname}.`);
}

const consentDocument = personalDataDocument();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const migrated = await client.query(`SELECT to_regclass('public."Request"') AS "table"`);
  if (!migrated.rows[0].table)
    fail("the database has no tables: run `pnpm --dir apps/api exec prisma migrate deploy`.");

  await client.query("BEGIN");
  const passwordHash = hashPassword(demoPassword);
  for (const user of users) {
    await client.query(
      `INSERT INTO "User" (id, name, login, "passwordHash", role, "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"UserRole", now())
       ON CONFLICT DO NOTHING`,
      [user.id, user.name, user.login, passwordHash, user.role],
    );
  }
  for (const category of categories) {
    await client.query(
      `INSERT INTO "Category" (id, name, slug, "updatedAt") VALUES ($1, $2, $3, now())
       ON CONFLICT DO NOTHING`,
      [category.id, category.name, category.slug],
    );
  }
  for (const [
    id,
    sku,
    name,
    category,
    price,
    stock,
    [piston, rod, stroke, length],
    active = true,
  ] of products) {
    await client.query(
      `INSERT INTO "Product" (id, sku, name, slug, price, "stockQuantity", "isActive", "categoryId",
         "pistonDiameterMm", "rodDiameterMm", "strokeMm", "collapsedLengthMm",
         "maxPressureMpa", "nominalPressureMpa", "shortDescription", "updatedAt")
       VALUES ($1, $2, $3, $1, $4, $5, $6, $7, $8, $9, $10, $11, 20, 16, $12, now())
       ON CONFLICT DO NOTHING`,
      [
        id,
        sku,
        name,
        price,
        stock,
        active,
        `demo-category-${category.slice(5)}`,
        piston,
        rod,
        stroke,
        length,
        `Ø поршня ${piston} мм, ход ${stroke} мм`,
      ],
    );
  }
  for (const [
    id,
    firstName,
    lastName,
    middleName,
    phone,
    normalizedPhone,
    email,
    company,
  ] of customers) {
    await client.query(
      `INSERT INTO "Customer" (id, "firstName", "lastName", "middleName", phone, "normalizedPhone",
         email, "normalizedEmail", company, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, lower($7), $8, now())
       ON CONFLICT DO NOTHING`,
      [id, firstName, lastName, middleName, phone, normalizedPhone, email, company],
    );
  }

  const cart = await createRequest("demo-request-cart", "CART", "demo-customer-1", {
    comment: "Нужна отгрузка до конца месяца.",
  });
  if (cart) {
    const items = [
      ["demo-product-1", 1],
      ["demo-product-4", 2],
    ];
    const priceOf = (productId) => products.find(([id]) => id === productId)[4];
    const subtotal = items.reduce(
      (sum, [productId, quantity]) => sum + priceOf(productId) * quantity,
      0,
    );
    await client.query(
      `INSERT INTO "CartRequest" (id, "requestId", subtotal, "deliveryType", "paymentType")
       VALUES ($1, $1, $2, 'PICKUP', 'BANK_TRANSFER')`,
      [cart, subtotal],
    );
    for (const [index, [productId, quantity]] of items.entries()) {
      const [, sku, name, , price] = products.find(([id]) => id === productId);
      await client.query(
        `INSERT INTO "CartRequestItem" (id, "cartRequestId", "productId", "productName", sku, price, quantity, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `${cart}-item-${index + 1}`,
          cart,
          productId,
          name,
          sku,
          price,
          quantity,
          price * quantity,
        ],
      );
    }
  }

  const custom = await createRequest("demo-request-custom", "CUSTOM", "demo-customer-2", {
    comment: "Гидроцилиндр по чертежу, 2 шт. Чертёж отправлю на почту.",
    status: "IN_PROGRESS",
  });
  if (custom) {
    await client.query(`INSERT INTO "CustomRequest" (id, "requestId") VALUES ($1, $1)`, [custom]);
    await client.query(
      `INSERT INTO "RequestActivity" (id, "requestId", "userId", type, data)
       VALUES ($1 || '-in-progress', $1, 'demo-user-manager', 'STATUS_CHANGED', '{"from":"NEW","to":"IN_PROGRESS"}')`,
      [custom],
    );
    await client.query(
      `INSERT INTO "RequestComment" (id, "requestId", "authorId", text, "updatedAt")
       VALUES ($1 || '-comment', $1, 'demo-user-manager', 'Ждём чертёж от клиента.', now())`,
      [custom],
    );
  }

  const wholesale = await createRequest("demo-request-wholesale", "WHOLESALE", "demo-customer-3", {
    comment: "Интересует поставка 20 гидроцилиндров в квартал.",
    status: "COMPLETED",
  });
  if (wholesale) {
    await client.query(`INSERT INTO "WholesaleRequest" (id, "requestId") VALUES ($1, $1)`, [
      wholesale,
    ]);
  }

  await client.query("COMMIT");
  console.log(
    `Demo data is in place: logins ${users.map((user) => user.login).join(", ")}, password ${demoPassword}.`,
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

/** Inserts a request with its consent and history once; returns its id, or null if it exists. */
async function createRequest(id, type, customerId, { comment, status = "NEW" }) {
  const [firstName, lastName, middleName, phone, email, company] = (
    await client.query(
      `SELECT "firstName", "lastName", "middleName", phone, email, company FROM "Customer" WHERE id = $1`,
      [customerId],
    )
  ).rows.map((row) => Object.values(row))[0];
  const inserted = await client.query(
    `INSERT INTO "Request" (id, number, type, status, "customerId", "firstName", "lastName", "middleName",
       phone, email, company, comment, "firstRespondedAt", "updatedAt")
     VALUES ($1, $1, $2::"RequestType", $3::"RequestStatus", $4, $5, $6, $7, $8, $9, $10, $11,
       CASE WHEN $3 = 'NEW' THEN NULL ELSE now() END, now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [id, type, status, customerId, firstName, lastName, middleName, phone, email, company, comment],
  );
  if (inserted.rowCount === 0) return null;
  // The visible number is the sequence value, as the API assigns it.
  await client.query(`UPDATE "Request" SET number = sequence::text WHERE id = $1`, [id]);
  await client.query(
    `INSERT INTO "Consent" (id, "requestId", type, "documentVersion", "documentHash")
     VALUES ($1 || '-consent', $1, 'PERSONAL_DATA', $2, $3)`,
    [id, consentDocument.version, consentDocument.hash],
  );
  await client.query(
    `INSERT INTO "RequestActivity" (id, "requestId", type) VALUES ($1 || '-created', $1, 'REQUEST_CREATED')`,
    [id],
  );
  return id;
}

/** The consent document the API accepts: from the environment or the defaults in the source. */
function personalDataDocument() {
  const source = readFileSync(
    new URL("../src/requests/personal-data-document.ts", import.meta.url),
    "utf8",
  );
  const constant = (name) => new RegExp(`${name} =\\s*'([^']+)'`).exec(source)?.[1];
  return {
    version:
      process.env.PERSONAL_DATA_DOCUMENT_VERSION?.trim() ||
      constant("DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION"),
    hash:
      process.env.PERSONAL_DATA_DOCUMENT_HASH?.trim() ||
      constant("DEFAULT_PERSONAL_DATA_DOCUMENT_HASH"),
  };
}

/** Same format as src/auth/password-hash.ts. */
function hashPassword(password) {
  const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 };
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, options);
  return `scrypt$${options.N}$${options.r}$${options.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function fail(message) {
  console.error(`db:seed: ${message}`);
  process.exit(1);
}
