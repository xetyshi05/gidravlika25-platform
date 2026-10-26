import { defineConfig, devices } from "@playwright/test";
import {
  backofficeEnvironment,
  crmEnvironment,
  isolatedEnvironment,
  ports,
  root,
  urls,
  webEnvironment,
} from "./environment.mjs";

const isCI = Boolean(process.env.CI);

/** `next start` of an app built by `pnpm e2e:build`, with an empty data cache. */
function nextServer(app: string, port: number, environment: Record<string, string>) {
  return {
    command: `node e2e/servers/start-next.mjs ${app} ${port}`,
    cwd: root,
    url: `http://localhost:${port}`,
    env: isolatedEnvironment([`apps/${app}`], { ...environment, NODE_ENV: "production" }),
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore" as const,
    stderr: "pipe" as const,
  };
}

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  // One database for the whole run: scenarios use their own seeded records, but
  // run one at a time so a CRM list or a catalog page never races another test.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/servers/mock-image-worker.mjs",
      cwd: root,
      url: `${urls.imageWorker}/health`,
      reuseExistingServer: false,
    },
    {
      // Recreates and seeds the database before the API starts.
      command: "node e2e/servers/start-api.mjs",
      cwd: root,
      url: `${urls.api}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    nextServer("web", ports.web, webEnvironment),
    nextServer("crm", ports.crm, crmEnvironment),
    nextServer("backoffice", ports.backoffice, backofficeEnvironment),
  ],
});
