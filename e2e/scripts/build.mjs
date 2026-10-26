// Builds the API and the three Next.js apps for the browser E2E stand. The web
// build inlines NEXT_PUBLIC_API_URL and the CSP, so it must use the stand's URLs.
import { spawnSync } from "node:child_process";
import {
  backofficeEnvironment,
  crmEnvironment,
  isolatedEnvironment,
  root,
  webEnvironment,
} from "../environment.mjs";

const environment = isolatedEnvironment(["apps/api", "apps/web", "apps/crm", "apps/backoffice"], {
  ...crmEnvironment,
  ...backofficeEnvironment,
  ...webEnvironment,
  NODE_ENV: "production",
});

const filters = ["api", "web", "crm", "backoffice"].map((name) => `--filter=${name}`);
const result = spawnSync("pnpm", ["exec", "turbo", "build", ...filters], {
  cwd: root,
  env: environment,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
