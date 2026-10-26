// `next start` for the browser E2E stand. The data cache in .next/cache survives
// builds and restarts, so without clearing it the site would show catalog data
// of the previous run next to a freshly seeded database.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { root, urls } from "../environment.mjs";

const [app, port] = process.argv.slice(2);
if (!app || !port) throw new Error("Usage: start-next.mjs <app> <port>");
const directory = join(root, "apps", app);
// A regular build of the site sends browser requests to the development API
// (NEXT_PUBLIC_API_URL and the CSP are inlined at build time).
const routesManifest = join(directory, ".next/routes-manifest.json");
if (
  app === "web" &&
  (!existsSync(routesManifest) || !readFileSync(routesManifest, "utf8").includes(urls.api))
) {
  throw new Error("apps/web is not built for the E2E stand: run pnpm e2e:build first.");
}
rmSync(join(directory, ".next/cache/fetch-cache"), { recursive: true, force: true });

const server = spawn("pnpm", ["exec", "next", "start", "--port", port], {
  cwd: directory,
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 1));
