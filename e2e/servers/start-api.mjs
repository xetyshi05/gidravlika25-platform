// Starts the API of the browser E2E stand on a fresh database: recreates it,
// applies the migrations, seeds e2e/fixtures/data.mjs and runs the built API.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { apiEnvironment, isolatedEnvironment, root, urls } from "../environment.mjs";
import { category, customer, customRequest, password, products, users } from "../fixtures/data.mjs";

const environment = isolatedEnvironment(["apps/api"], apiEnvironment);
const databaseUrl = new URL(environment.DATABASE_URL);
const database = databaseUrl.pathname.slice(1);
// The database is dropped on every start: never let this touch anything else.
if (!database.startsWith("gidravlika_e2e")) {
  throw new Error(`E2E database name must start with gidravlika_e2e, got "${database}".`);
}

await recreateDatabase();
run("pnpm", ["--dir", "apps/api", "exec", "prisma", "migrate", "deploy"]);
await seed();
await waitForBucket();
rmSync(apiEnvironment.MEDIA_ORIGINALS_DIR, { recursive: true, force: true });
mkdirSync(apiEnvironment.MEDIA_ORIGINALS_DIR, { recursive: true });

const api = spawn(process.execPath, [join(root, "apps/api/dist/src/main.js")], {
  cwd: join(root, "apps/api"),
  env: environment,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => api.kill(signal));
api.on("exit", (code) => process.exit(code ?? 1));

async function recreateDatabase() {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  await withClient(adminUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  });
}

async function seed() {
  const passwordHash = hashPassword(password);
  await withClient(databaseUrl, async (client) => {
    for (const user of Object.values(users)) {
      await client.query(
        `INSERT INTO "User" (id, name, login, "passwordHash", role, "twoFactorEnabled", "twoFactorEnabledAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"UserRole", $6, CASE WHEN $6 THEN now() END, now())`,
        [user.id, user.name, user.login, passwordHash, user.role, !user.setupRequired],
      );
    }
    await client.query(
      `INSERT INTO "Category" (id, name, slug, "updatedAt") VALUES ($1, $2, $3, now())`,
      [category.id, category.name, category.slug],
    );
    for (const product of Object.values(products)) {
      await client.query(
        `INSERT INTO "Product" (id, sku, name, slug, price, "stockQuantity", "isActive", "categoryId",
           "pistonDiameterMm", "rodDiameterMm", "strokeMm", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 50, 25, 200, now())`,
        [
          product.id,
          product.sku,
          product.name,
          product.slug,
          product.price,
          product.stockQuantity,
          product.isActive,
          category.id,
        ],
      );
    }
    await client.query(
      `INSERT INTO "Customer" (id, "firstName", "lastName", "middleName", phone, "normalizedPhone", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        customer.id,
        customer.firstName,
        customer.lastName,
        customer.middleName,
        customer.phone,
        customer.normalizedPhone,
      ],
    );
    // The number is the sequence value, as the API assigns it.
    await client.query(
      `INSERT INTO "Request" (id, number, type, "customerId", "firstName", "lastName", "middleName", phone, comment, "updatedAt")
       VALUES ($1, $1, 'CUSTOM', $2, $3, $4, $5, $6, $7, now())`,
      [
        customRequest.id,
        customer.id,
        customer.firstName,
        customer.lastName,
        customer.middleName,
        customer.phone,
        customRequest.comment,
      ],
    );
    await client.query(`UPDATE "Request" SET number = sequence::text WHERE id = $1`, [
      customRequest.id,
    ]);
    await client.query(`INSERT INTO "CustomRequest" (id, "requestId") VALUES ($1, $1)`, [
      customRequest.id,
    ]);
    await client.query(
      `INSERT INTO "RequestActivity" (id, "requestId", type) VALUES ($1, $1, 'REQUEST_CREATED')`,
      [customRequest.id],
    );
  });
}

/** Same format as apps/api/src/auth/password-hash.ts. */
function hashPassword(value) {
  const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 };
  const salt = randomBytes(16);
  const hash = scryptSync(value, salt, 64, options);
  return `scrypt$${options.N}$${options.r}$${options.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** S3Mock of e2e/compose.yml creates the bucket while it starts. */
async function waitForBucket() {
  const probe = `${urls.s3}/${apiEnvironment.S3_BUCKET}/e2e-readiness-probe`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const body = await fetch(probe)
      .then((response) => response.text())
      .catch(() => "");
    if (body.includes("NoSuchKey")) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`S3 bucket ${apiEnvironment.S3_BUCKET} is not ready: run pnpm e2e:infra.`);
}

async function withClient(url, callback) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...environment, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}
