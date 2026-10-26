const applicationVariables = {
  web: [
    "API_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_SITE_URL",
    "S3_PUBLIC_URL",
    "CATALOG_REVALIDATION_SECRET",
  ],
  crm: ["API_URL", "S3_PUBLIC_URL"],
  backoffice: ["API_URL", "S3_PUBLIC_URL", "BACKOFFICE_ORIGIN"],
};
const deploymentEnvironments = new Set(["development", "test", "staging", "production"]);

export function validateNextEnvironment(application, environment) {
  const errors = [];
  const appEnvironment = environment.APP_ENV?.trim() || "development";

  if (!Object.hasOwn(applicationVariables, application)) {
    throw new Error(`Unknown Next.js application: ${application}`);
  }
  if (!deploymentEnvironments.has(appEnvironment)) {
    errors.push("APP_ENV must be development, test, staging or production.");
  }

  validateOptionalHttpUrl(environment.API_URL, "API_URL", errors);
  validateOptionalHttpUrl(environment.NEXT_PUBLIC_API_URL, "NEXT_PUBLIC_API_URL", errors);
  validateOptionalHttpUrl(environment.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL", errors, true);
  validateOptionalHttpUrl(environment.S3_PUBLIC_URL, "S3_PUBLIC_URL", errors);
  validateOptionalHttpUrl(environment.BACKOFFICE_ORIGIN, "BACKOFFICE_ORIGIN", errors, true);
  validateOptionalBoolean(environment.S3_ALLOW_LOCAL_IP, "S3_ALLOW_LOCAL_IP", errors);

  const isDeployment = appEnvironment === "staging" || appEnvironment === "production";
  if (isDeployment) {
    for (const name of applicationVariables[application]) required(environment, name, errors);

    if (application === "web") {
      requirePublicHttps(environment.NEXT_PUBLIC_API_URL, "NEXT_PUBLIC_API_URL", errors);
      requirePublicHttps(environment.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL", errors);
      minimumSecretLength(environment.CATALOG_REVALIDATION_SECRET, 32, errors);
    }
    if (application === "web" || application === "crm" || application === "backoffice") {
      requirePublicHttps(environment.S3_PUBLIC_URL, "S3_PUBLIC_URL", errors);
    }
    if (application === "backoffice") {
      requirePublicHttps(environment.BACKOFFICE_ORIGIN, "BACKOFFICE_ORIGIN", errors);
    }
    rejectLocalhost(environment.API_URL, "API_URL", errors);
    rejectLocalhost(environment.NEXT_PUBLIC_API_URL, "NEXT_PUBLIC_API_URL", errors);
    rejectLocalhost(environment.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL", errors);
    rejectLocalhost(environment.S3_PUBLIC_URL, "S3_PUBLIC_URL", errors);
    rejectLocalhost(environment.BACKOFFICE_ORIGIN, "BACKOFFICE_ORIGIN", errors);
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid ${application} environment configuration:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }

  return environment;
}

function required(environment, name, errors) {
  if (!environment[name]?.trim()) errors.push(`${name} is required.`);
}

function validateOptionalHttpUrl(value, name, errors, originOnly = false) {
  if (!value?.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push(`${name} must use http: or https:.`);
    }
    if (url.username || url.password) errors.push(`${name} must not contain credentials.`);
    if (originOnly && (url.pathname !== "/" || url.search || url.hash)) {
      errors.push(`${name} must be an origin without a path, query or fragment.`);
    }
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

function requirePublicHttps(value, name, errors) {
  if (!value?.trim()) return;
  try {
    if (new URL(value).protocol !== "https:") errors.push(`${name} must use https: in deployment.`);
  } catch {
    // The malformed URL is already reported by validateOptionalHttpUrl.
  }
}

function rejectLocalhost(value, name, errors) {
  if (!value?.trim()) return;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      errors.push(`${name} must not point to localhost in deployment.`);
    }
  } catch {
    // The malformed URL is already reported by validateOptionalHttpUrl.
  }
}

function minimumSecretLength(value, length, errors) {
  if (!value?.trim()) return;

  if (value.length < length) {
    errors.push(`CATALOG_REVALIDATION_SECRET must contain at least ${length} characters.`);
  }
  if (/replace|change[-_ ]?me|example/i.test(value)) {
    errors.push("CATALOG_REVALIDATION_SECRET must not use a placeholder value.");
  }
}

function validateOptionalBoolean(value, name, errors) {
  if (value === undefined || value.trim() === "") return;
  if (value.trim().toLowerCase() !== "true" && value.trim().toLowerCase() !== "false") {
    errors.push(`${name} must be true or false.`);
  }
}
