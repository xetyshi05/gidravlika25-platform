"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { components } from "@gidravlika25/api-contract";
import { createApiClient, timedFetch } from "@gidravlika25/api-contract/client";
import { safeNextPath } from "@/lib/safe-next-path";

// Without the session middleware of lib/api.ts: these calls carry their own credentials.
const authApi = createApiClient(process.env.API_URL ?? "http://localhost:4000");
const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
type SessionResponse = components["schemas"]["AuthSession"];
type TwoFactorResponse = components["schemas"]["TwoFactorRequired"];
export type TwoFactorSetup = components["schemas"]["TwoFactorSetup"];
export type RecoveryCodesActionResult =
  { ok: true; recoveryCodes: string[] } | { ok: false; message: string };
/** Set only after 2FA setup: the new recovery codes are shown once and never stored. */
export type TwoFactorActionState = { recoveryCodes: string[]; next: string } | null;

const nextCookie = "crm_login_next";

export async function login(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const clientAddressHeader = await getClientAddressHeader();
  const {
    data: result,
    error,
    response,
  } = await authCall((options) =>
    authApi.POST("/auth/login", {
      ...options,
      params: { header: { "x-application": "CRM" } },
      headers: clientAddressHeader,
      body: { login: formText(formData, "login"), password: formText(formData, "password") },
    }),
  );
  if (!result) redirect(loginUrl(loginError(response.status, error), next));
  await saveChallenge(result);
  const cookieStore = await cookies();
  if (next)
    cookieStore.set(nextCookie, next, {
      ...authCookieOptions,
      expires: new Date(result.expiresAt),
    });
  else cookieStore.delete(nextCookie);
  redirect(`/login?step=${result.setupRequired ? "two-factor-setup" : "two-factor"}`);
}
export async function getTwoFactorSetup(): Promise<TwoFactorSetup | null> {
  const challenge = (await cookies()).get("crm_2fa_challenge")?.value;
  if (!challenge) return null;
  const { data } = await authCall((options) =>
    authApi.GET("/auth/two-factor/challenge", {
      ...options,
      params: { header: { "x-two-factor-challenge": challenge } },
    }),
  );
  return data ?? null;
}
export async function verifyTwoFactor(
  _previousState: TwoFactorActionState,
  formData: FormData,
): Promise<TwoFactorActionState> {
  const cookieStore = await cookies();
  const challenge = cookieStore.get("crm_2fa_challenge")?.value;
  if (!challenge) redirect("/login?error=two-factor-expired");
  const { data: session, error } = await authCall((options) =>
    authApi.POST("/auth/two-factor/verify", {
      ...options,
      params: { header: { "x-two-factor-challenge": challenge } },
      body: { code: formText(formData, "code") },
    }),
  );
  if (!session) {
    const errorCode = authErrorCode(error);
    const loginError = twoFactorLoginErrors[errorCode ?? ""];
    if (loginError) {
      cookieStore.delete("crm_2fa_challenge");
      redirect(`/login?error=${loginError}`);
    }
    // Keep the screen the user was on: setup with the QR code, recovery-code mode.
    const retry = new URLSearchParams({
      step: formData.get("setup") ? "two-factor-setup" : "two-factor",
      error: "two-factor-invalid",
    });
    if (formData.get("method") === "recovery") retry.set("method", "recovery");
    redirect(`/login?${retry.toString()}`);
  }
  cookieStore.delete("crm_2fa_challenge");
  await saveSession(session);
  const next = safeNextPath(cookieStore.get(nextCookie)?.value) ?? "/";
  cookieStore.delete(nextCookie);
  if (session.recoveryCodes?.length) return { recoveryCodes: session.recoveryCodes, next };
  redirect(next);
}
/** API error codes that end the 2FA step and send the user back to the password form. */
const twoFactorLoginErrors: Record<string, string> = {
  TWO_FACTOR_ATTEMPTS_EXHAUSTED: "two-factor-attempts-exhausted",
  TWO_FACTOR_ACCOUNT_LOCKED: "two-factor-locked",
  TWO_FACTOR_CHALLENGE_EXPIRED: "two-factor-expired",
};
export async function regenerateRecoveryCodes(): Promise<RecoveryCodesActionResult> {
  const token = (await cookies()).get("crm_session")?.value;
  if (!token) return { ok: false, message: "Сессия истекла. Войдите в CRM заново." };
  try {
    const { data, response } = await authApi.POST("/auth/recovery-codes", {
      ...authOptions(),
      params: { header: { authorization: `Bearer ${token}`, "x-application": "CRM" } },
    });
    if (!data)
      return {
        ok: false,
        message:
          response.status === 401
            ? "Сессия истекла. Войдите в CRM заново."
            : "Не удалось перевыпустить резервные коды.",
      };
    return { ok: true, recoveryCodes: data.recoveryCodes };
  } catch {
    return { ok: false, message: "Сервис авторизации временно недоступен." };
  }
}
export async function logout() {
  const token = (await cookies()).get("crm_session")?.value;
  if (token)
    await authApi
      .POST("/auth/logout", {
        ...authOptions(),
        params: { header: { authorization: `Bearer ${token}` } },
      })
      .catch(() => undefined);
  (await cookies()).delete("crm_session");
  redirect("/login");
}
async function saveChallenge(challenge: TwoFactorResponse) {
  (await cookies()).set("crm_2fa_challenge", challenge.challengeToken, {
    ...authCookieOptions,
    expires: new Date(challenge.expiresAt),
  });
}
async function saveSession(session: SessionResponse) {
  (await cookies()).set("crm_session", session.token, {
    ...authCookieOptions,
    expires: new Date(session.expiresAt),
  });
}

function loginError(status: number, error: unknown) {
  if (status !== 429) return "invalid-credentials";
  return authErrorCode(error) === "LOGIN_ACCOUNT_LOCKED"
    ? "login-account-locked"
    : "login-rate-limited";
}

function loginUrl(error: string, next: string | null) {
  const query = new URLSearchParams({ error });
  if (next) query.set("next", next);
  return `/login?${query.toString()}`;
}

function authOptions() {
  return { cache: "no-store" as const, fetch: timedFetch(10_000) };
}

/** A login step: an unreachable or silent API sends the user back with a clear message. */
async function authCall<T>(call: (options: ReturnType<typeof authOptions>) => Promise<T>) {
  try {
    return await call(authOptions());
  } catch {
    redirect("/login?error=service-unavailable");
  }
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function getClientAddressHeader(): Promise<Record<string, string>> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const candidate =
    requestHeaders.get("x-real-ip") ?? forwardedFor?.split(",").at(-1)?.trim() ?? "";
  return /^[0-9a-f:.]{2,64}$/i.test(candidate) ? { "X-Forwarded-For": candidate } : {};
}

function authErrorCode(error: unknown) {
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return typeof code === "string" ? code : undefined;
}
