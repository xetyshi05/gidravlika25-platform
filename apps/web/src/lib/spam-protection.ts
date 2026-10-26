import { RequestApiError, isCaptchaError } from "./requests-api.ts";

/** Imperative handle of the ALTCHA widget in a form. */
export type SpamProtectionHandle = {
  /** Resolves to an ALTCHA payload; `fresh` discards an existing solution. */
  solve(fresh?: boolean): Promise<string>;
  /** Forgets the current solution; the next `solve` fetches a new challenge. */
  reset(): void;
};

/**
 * Sends a public form with an ALTCHA payload (SEC-03). A solution is accepted
 * by the API once, so it is discarded after every answer from the server. If
 * the API rejects the check itself (expired or already used), the form is
 * sent once more with a fresh solution; network errors keep the solution, as
 * the retry reuses the Idempotency-Key and may get the original receipt.
 */
export async function submitWithSpamProtection<T>(
  protection: SpamProtectionHandle | null,
  send: (altcha: string) => Promise<T>,
): Promise<T> {
  if (!protection) throw new RequestApiError("captcha");
  for (let attempt = 0; ; attempt += 1) {
    const altcha = await solve(protection, attempt > 0);
    try {
      return await send(altcha);
    } catch (error) {
      if (reachedServer(error)) protection.reset();
      if (attempt === 0 && isCaptchaError(error)) continue;
      throw error;
    }
  }
}

async function solve(protection: SpamProtectionHandle, fresh: boolean) {
  try {
    return await protection.solve(fresh);
  } catch {
    throw new RequestApiError("captcha");
  }
}

function reachedServer(error: unknown) {
  return (
    !(error instanceof RequestApiError) ||
    (error.status !== "network" && error.status !== "timeout")
  );
}
