import "dotenv/config";
import { spawnSync } from "node:child_process";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const baseDatabaseUrl = process.env.DATABASE_URL;
if (!baseDatabaseUrl) throw new Error("Set DATABASE_URL before checking migration drift.");

const adminUrl = new URL(baseDatabaseUrl);
if (!["postgres:", "postgresql:"].includes(adminUrl.protocol)) {
  throw new Error("Migration drift checks require PostgreSQL.");
}
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
adminUrl.searchParams.delete("options");

const database = `gidravlika_migration_check_${process.pid}_${Date.now()}`;
const testUrl = new URL(baseDatabaseUrl);
testUrl.pathname = `/${database}`;
testUrl.searchParams.set("schema", "public");
testUrl.searchParams.delete("options");
const childEnvironment = { ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test" };

await withClient(adminUrl.toString(), (client) => client.query(`CREATE DATABASE "${database}"`));

try {
  run("pnpm", ["exec", "prisma", "migrate", "deploy"], childEnvironment);
  run(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "diff",
      "--exit-code",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
    ],
    childEnvironment,
  );
} finally {
  await withClient(adminUrl.toString(), async (client) => {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [database],
    );
    await client.query(`DROP DATABASE IF EXISTS "${database}"`);
  });
}

function run(command, arguments_, environment) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  const status = result.status ?? 1;
  if (result.error) throw result.error;
  if (status !== 0) throw new Error(`${command} ${arguments_.join(" ")} exited with ${status}.`);
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
