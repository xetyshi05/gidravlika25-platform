import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getTwoFactorSetup, login, verifyTwoFactor } from "@/app/auth-actions";
import { TwoFactorCodeInput } from "@/components/two-factor-code-input";
import { safeNextPath } from "@/lib/safe-next-path";

export const metadata: Metadata = { title: "Вход" };
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const step = first(params.step);
  const error = first(params.error);
  const message = errorMessage(error);
  const next = safeNextPath(first(params.next));
  if (step === "two-factor" || step === "two-factor-setup")
    return (
      <TwoFactorScreen
        isSetup={step === "two-factor-setup"}
        setup={step === "two-factor-setup" ? await getTwoFactorSetup() : null}
        message={message}
        challengeExpired={error === "two-factor-expired"}
        recoveryMode={first(params.method) === "recovery"}
      />
    );
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full border border-slate-200 bg-white p-6 sm:p-8">
        <Brand />
        <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-950">Вход</h1>
        {message ? (
          <p
            id="login-error"
            role="alert"
            aria-live="assertive"
            className="mt-4 border-l-2 border-brand bg-red-50 p-3 text-sm text-slate-700"
          >
            {message}
          </p>
        ) : null}
        <form action={login} className="mt-6 grid gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Логин
            <input
              required
              name="login"
              maxLength={50}
              autoComplete="username"
              aria-invalid={Boolean(message)}
              aria-describedby={message ? "login-error" : undefined}
              className="h-11 border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Пароль
            <input
              required
              name="password"
              type="password"
              maxLength={128}
              autoComplete="current-password"
              aria-invalid={Boolean(message)}
              aria-describedby={message ? "login-error" : undefined}
              className="h-11 border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
          >
            Продолжить
          </button>
        </form>
      </section>
    </main>
  );
}
function TwoFactorScreen({
  isSetup,
  setup,
  message,
  challengeExpired,
  recoveryMode,
}: {
  isSetup: boolean;
  setup: Awaited<ReturnType<typeof getTwoFactorSetup>>;
  message: string | null;
  challengeExpired: boolean;
  recoveryMode: boolean;
}) {
  const expired = challengeExpired || (isSetup && !setup);
  const intro = (
    <>
      <p className="mt-6 text-xs font-semibold tracking-[.14em] text-brand">
        ДВУХФАКТОРНАЯ АУТЕНТИФИКАЦИЯ
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
        {setup ? "Подключите приложение" : "Введите код"}
      </h1>
    </>
  );
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full border border-slate-200 bg-white p-6 sm:p-8">
        <Brand />
        <TwoFactorCodeInput
          action={verifyTwoFactor}
          setup={Boolean(setup)}
          expired={expired}
          recoveryMode={recoveryMode}
          invalid={Boolean(message)}
          errorId={message ? "two-factor-error" : undefined}
        >
          {intro}
          {expired ? (
            <>
              <p
                role="alert"
                className="mt-4 border-l-2 border-brand bg-red-50 p-3 text-sm text-slate-700"
              >
                {isSetup ? "Время настройки истекло." : "Время подтверждения истекло."} Войдите
                снова с логином и паролем.
              </p>
              <Link
                href="/login"
                className="mt-5 inline-flex min-h-11 items-center justify-center bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
              >
                Вернуться ко входу
              </Link>
            </>
          ) : (
            <>
              {setup ? (
                <div className="mt-5 grid gap-5 sm:grid-cols-[12rem_1fr] sm:items-start">
                  <div className="border border-slate-200 bg-white p-2">
                    <Image
                      src={setup.qrDataUrl}
                      alt="QR-код для приложения-аутентификатора"
                      width={192}
                      height={192}
                      unoptimized
                      className="size-48"
                    />
                  </div>
                  <div className="text-sm leading-6 text-slate-600">
                    <p>
                      Откройте Google Authenticator, Microsoft Authenticator, 1Password или другое
                      совместимое приложение и отсканируйте QR-код.
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      Если камеры нет, введите ключ вручную:
                    </p>
                    <code className="mt-1 block break-all border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">
                      {setup.manualKey}
                    </code>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Введите шестизначный код из приложения-аутентификатора. Вместо него можно
                  использовать неиспользованный резервный код.
                </p>
              )}
              {message ? (
                <p
                  id="two-factor-error"
                  role="alert"
                  aria-live="assertive"
                  className="mt-4 border-l-2 border-brand bg-red-50 p-3 text-sm text-slate-700"
                >
                  {message}
                </p>
              ) : null}
            </>
          )}
        </TwoFactorCodeInput>
      </section>
    </main>
  );
}
function Brand() {
  return (
    <div className="flex items-center justify-center gap-1">
      <Image
        src="/icon.png"
        alt="Гидравлика 25"
        width={1254}
        height={1254}
        className="size-11 object-contain"
        priority
      />
      <Image
        src="/logo_text.png"
        alt="Гидравлика 25"
        width={2172}
        height={724}
        className="h-9 w-27 object-contain"
        priority
      />
      <span className="border-l border-slate-200 pl-2 font-days text-sm tracking-wide text-brand">
        CRM
      </span>
    </div>
  );
}
const errorMessages: Record<string, string> = {
  "invalid-credentials": "Неверный логин или пароль.",
  "login-rate-limited": "Слишком много попыток входа с этого адреса. Повторите через минуту.",
  "login-account-locked":
    "Слишком много неудачных попыток входа в эту учётную запись. Вход приостановлен на несколько минут — повторите позже.",
  "two-factor-invalid":
    "Код неверный или уже использован. После пяти попыток потребуется войти заново.",
  "two-factor-attempts-exhausted": "Лимит попыток кода исчерпан. Введите логин и пароль заново.",
  "two-factor-locked":
    "Слишком много неверных кодов для этой учётной записи. Вход временно заблокирован — повторите позже. Если коды вводили не вы, сообщите администратору.",
  "two-factor-expired": "Время подтверждения истекло. Войдите снова.",
  "service-unavailable": "Сервер не ответил вовремя. Проверьте соединение и повторите попытку.",
};
function errorMessage(error?: string) {
  return error && Object.hasOwn(errorMessages, error) ? errorMessages[error] : null;
}
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
