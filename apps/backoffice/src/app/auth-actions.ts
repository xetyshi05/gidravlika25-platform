"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { components } from "@gidravlika25/api-contract";
import { createApiClient, timedFetch } from "@gidravlika25/api-contract/client";

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

export async function setupAdmin(data: FormData) {
  const { data: challenge, response } = await authCall((options) =>
    authApi.POST("/auth/setup", {
      ...options,
      params: { header: { "x-bootstrap-secret": formText(data, "bootstrapSecret") } },
      body: {
        name: formText(data, "name"),
        login: formText(data, "login"),
        password: formText(data, "password"),
      },
    }),
  );
  if (!challenge)
    redirect(response.status === 409 ? "/login?error=admin-exists" : "/login?error=setup-failed");
  await saveChallenge(challenge);
  redirect("/login?step=two-factor-setup");
}
export async function login(data: FormData) {
  const clientAddressHeader = await getClientAddressHeader();
  const {
    data: result,
    error,
    response,
  } = await authCall((options) =>
    authApi.POST("/auth/login", {
      ...options,
      params: { header: { "x-application": "BACKOFFICE" } },
      headers: clientAddressHeader,
      body: { login: formText(data, "login"), password: formText(data, "password") },
    }),
  );
  // The admin role is checked by the API only after 2FA (see verifyTwoFactor).
  if (!result) redirect(`/login?error=${loginError(response.status, error)}`);
  await saveChallenge(result);
  redirect(`/login?step=${result.setupRequired ? "two-factor-setup" : "two-factor"}`);
}
export async function getTwoFactorSetup(): Promise<TwoFactorSetup | null> {
  const challenge = (await cookies()).get("backoffice_2fa_challenge")?.value;
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
  data: FormData,
): Promise<TwoFactorActionState> {
  const cookieStore = await cookies();
  const challenge = cookieStore.get("backoffice_2fa_challenge")?.value;
  if (!challenge) redirect("/login?error=two-factor-expired");
  const { data: session, error } = await authCall((options) =>
    authApi.POST("/auth/two-factor/verify", {
      ...options,
      params: { header: { "x-two-factor-challenge": challenge } },
      body: { code: formText(data, "code") },
    }),
  );
  if (!session) {
    const errorCode = authErrorCode(error);
    const loginError = twoFactorLoginErrors[errorCode ?? ""];
    if (loginError) {
      cookieStore.delete("backoffice_2fa_challenge");
      redirect(`/login?error=${loginError}`);
    }
    // Keep the screen the user was on: setup with the QR code, recovery-code mode.
    const retry = new URLSearchParams({
      step: data.get("setup") ? "two-factor-setup" : "two-factor",
      error: "two-factor-invalid",
    });
    if (data.get("method") === "recovery") retry.set("method", "recovery");
    redirect(`/login?${retry.toString()}`);
  }
  cookieStore.delete("backoffice_2fa_challenge");
  await saveSession(session);
  if (session.recoveryCodes?.length) return { recoveryCodes: session.recoveryCodes, next: "/" };
  redirect("/");
}
/** API error codes that end the 2FA step and send the user back to the password form. */
const twoFactorLoginErrors: Record<string, string> = {
  TWO_FACTOR_ATTEMPTS_EXHAUSTED: "two-factor-attempts-exhausted",
  TWO_FACTOR_ACCOUNT_LOCKED: "two-factor-locked",
  TWO_FACTOR_CHALLENGE_EXPIRED: "two-factor-expired",
  APPLICATION_FORBIDDEN: "forbidden",
};
export async function regenerateRecoveryCodes(): Promise<RecoveryCodesActionResult> {
  const token = (await cookies()).get("backoffice_session")?.value;
  if (!token) return { ok: false, message: "Сессия истекла. Войдите в back office заново." };
  try {
    const { data, response } = await authApi.POST("/auth/recovery-codes", {
      ...authOptions(),
      params: { header: { authorization: `Bearer ${token}`, "x-application": "BACKOFFICE" } },
    });
    if (!data)
      return {
        ok: false,
        message:
          response.status === 401
            ? "Сессия истекла. Войдите в back office заново."
            : "Не удалось перевыпустить резервные коды.",
      };
    return { ok: true, recoveryCodes: data.recoveryCodes };
  } catch {
    return { ok: false, message: "Сервис авторизации временно недоступен." };
  }
}
export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get("backoffice_session")?.value;
  if (token)
    await authApi
      .POST("/auth/logout", {
        ...authOptions(5_000),
        params: { header: { authorization: `Bearer ${token}` } },
      })
      .catch(() => undefined);
  cookieStore.delete("backoffice_session");
  clearCsrfCookie(cookieStore);
  redirect("/login");
}
async function saveChallenge(challenge: TwoFactorResponse) {
  (await cookies()).set("backoffice_2fa_challenge", challenge.challengeToken, {
    ...authCookieOptions,
    expires: new Date(challenge.expiresAt),
  });
}
async function saveSession(session: SessionResponse) {
  const cookieStore = await cookies();
  cookieStore.set("backoffice_session", session.token, {
    ...authCookieOptions,
    expires: new Date(session.expiresAt),
  });
  clearCsrfCookie(cookieStore);
}

function clearCsrfCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set("backoffice_csrf", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/backoffice",
    maxAge: 0,
  });
}

function loginError(status: number, error: unknown) {
  if (status !== 429) return "invalid-credentials";
  return authErrorCode(error) === "LOGIN_ACCOUNT_LOCKED"
    ? "login-account-locked"
    : "login-rate-limited";
}

function authOptions(timeoutMs = 10_000) {
  return { cache: "no-store" as const, fetch: timedFetch(timeoutMs) };
}

/** A login step: an unreachable or silent API sends the user back with a clear message. */
async function authCall<T>(call: (options: ReturnType<typeof authOptions>) => Promise<T>) {
  try {
    return await call(authOptions());
  } catch {
    redirect("/login?error=service-unavailable");
  }
}

function formText(data: FormData, name: string) {
  const value = data.get(name);
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
