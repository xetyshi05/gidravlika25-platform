import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const baseDatabaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

if (!baseDatabaseUrl) {
  throw new Error("Set E2E_DATABASE_URL or DATABASE_URL before running E2E tests.");
}

const adminUrl = new URL(baseDatabaseUrl);
if (!["postgres:", "postgresql:"].includes(adminUrl.protocol)) {
  throw new Error("E2E tests require PostgreSQL.");
}
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
adminUrl.searchParams.delete("options");

const database = `gidravlika_e2e_${process.pid}_${Date.now()}`;
const testUrl = new URL(baseDatabaseUrl);
testUrl.pathname = `/${database}`;
testUrl.searchParams.set("schema", "public");
testUrl.searchParams.delete("options");
const childEnvironment = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  NODE_ENV: "test",
  PUBLIC_REQUEST_RATE_LIMIT_MAX: "100",
};

// E2E_DATABASE_ROLES=true reproduces production (INF-01): roles from
// prisma/database-roles.sql, migrations as migrator, tests as app_runtime.
// The roles are cluster-wide, so this mode needs a disposable PostgreSQL.
const databaseRoles = ["app_runtime", "migrator", "db_owner"];
const useDatabaseRoles = process.env.E2E_DATABASE_ROLES === "true";
if (useDatabaseRoles) {
  await withClient(adminUrl.toString(), async (client) => {
    const existing = await client.query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1)", [
      databaseRoles,
    ]);
    if (existing.rowCount > 0) {
      throw new Error(
        "E2E_DATABASE_ROLES needs a disposable PostgreSQL without db_owner, migrator and app_runtime roles.",
      );
    }
  });
}

await withClient(adminUrl.toString(), (client) => client.query(`CREATE DATABASE "${database}"`));

let exitCode = 1;
try {
  if (useDatabaseRoles) {
    const migratorPassword = randomBytes(24).toString("base64url");
    const runtimePassword = randomBytes(24).toString("base64url");
    const rolesSql = await readFile(
      new URL("../prisma/database-roles.sql", import.meta.url),
      "utf8",
    );
    await withClient(testUrl.toString(), async (client) => {
      await client.query("SELECT set_config('gidravlika.migrator_password', $1, false)", [
        migratorPassword,
      ]);
      await client.query("SELECT set_config('gidravlika.runtime_password', $1, false)", [
        runtimePassword,
      ]);
      await client.query(rolesSql);
    });
    const migratorEnvironment = {
      ...childEnvironment,
      DATABASE_URL: withCredentials(testUrl, "migrator", migratorPassword),
    };
    run("pnpm", ["exec", "prisma", "migrate", "deploy"], migratorEnvironment);
    run(
      "pnpm",
      ["exec", "prisma", "db", "execute", "--file", "prisma/runtime-grants.sql"],
      migratorEnvironment,
    );
    childEnvironment.DATABASE_URL = withCredentials(testUrl, "app_runtime", runtimePassword);
  } else {
    run("pnpm", ["exec", "prisma", "migrate", "deploy"], childEnvironment);
  }
  // --perf runs the PERF-01 measurements (test/perf) instead of the E2E suite.
  const jestConfig = process.argv.includes("--perf")
    ? "./test/jest-perf.json"
    : "./test/jest-e2e.json";
  exitCode = run(
    "pnpm",
    ["exec", "jest", "--config", jestConfig, "--runInBand", "--no-cache"],
    childEnvironment,
    false,
  );
} finally {
  await withClient(adminUrl.toString(), async (client) => {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [database],
    );
    await client.query(`DROP DATABASE IF EXISTS "${database}"`);
    if (useDatabaseRoles) {
      for (const role of databaseRoles) await client.query(`DROP ROLE IF EXISTS "${role}"`);
    }
  });
}

process.exitCode = exitCode;

function withCredentials(url, user, password) {
  const result = new URL(url);
  result.username = user;
  result.password = password;
  return result.toString();
}

function run(command, arguments_, environment, failOnError = true) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  const status = result.status ?? 1;
  if (result.error) throw result.error;
  if (failOnError && status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} exited with ${status}.`);
  }
  return status;
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
