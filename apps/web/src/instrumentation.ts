import { validateNextEnvironment } from "../../../config/validate-next-environment.mjs";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateNextEnvironment("web", process.env);
  }
}
