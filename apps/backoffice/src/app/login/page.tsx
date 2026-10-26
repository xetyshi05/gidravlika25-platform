import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getTwoFactorSetup, login, setupAdmin, verifyTwoFactor } from "@/app/auth-actions";
import { TwoFactorCodeInput } from "@/components/two-factor-code-input";
import { createApiClient, timedFetch } from "@gidravlika25/api-contract/client";

export const metadata: Metadata = { title: "Вход" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const [params, bootstrap] = await Promise.all([searchParams, getBootstrapStatus()]);
  const step = first(params.step);
  const error = first(params.error);
  const message = errorMessage(error);
  const isSetup = bootstrap.setupAvailable;
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
    <main className="bo-login mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-md border border-line bg-surface p-6 sm:p-8">
        <Brand />
        <h1 className="mt-6 text-3xl font-black tracking-tight">
          {isSetup ? "Первый администратор" : "Вход"}
        </h1>
        {isSetup && (
          <p className="mt-3 text-sm leading-6 text-copy-muted">
            Создайте учётную запись администратора для управления back office и CRM. После пароля
            потребуется настройка приложения-аутентификатора.
          </p>
        )}
        {message && (
          <p
            id="login-error"
            role="alert"
            aria-live="assertive"
            className="mt-4 border-l-2 border-brand bg-brand-soft/40 p-3 text-sm text-copy"
          >
            {message}
          </p>
        )}
        {isSetup && !bootstrap.setupSecretConfigured ? (
          <p
            role="alert"
            className="mt-6 border-l-2 border-amber-500 bg-amber-500/10 p-3 text-sm text-copy-muted"
          >
            Перед созданием первого администратора задайте{" "}
            <code className="text-copy">BOOTSTRAP_SECRET</code> в окружении API и перезапустите
            сервер.
          </p>
        ) : isSetup ? (
          <form action={setupAdmin} className="mt-6 grid gap-4">
            <Credentials
              newPassword
              invalid={Boolean(message)}
              errorId={message ? "login-error" : undefined}
            />
            <label className="grid gap-2 text-sm text-copy-muted">
              Bootstrap-секрет
              <input
                required
                name="bootstrapSecret"
                type="password"
                autoComplete="off"
                aria-invalid={Boolean(message)}
                aria-describedby={message ? "login-error" : undefined}
                className="h-11 border bg-field px-3 text-sm text-copy"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
            >
              Продолжить
            </button>
          </form>
        ) : (
          <form action={login} className="mt-6 grid gap-4">
            <Credentials invalid={Boolean(message)} errorId={message ? "login-error" : undefined} />
            <button
              type="submit"
              className="min-h-11 bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
            >
              Продолжить
            </button>
          </form>
        )}
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
      <h1 className="mt-2 text-3xl font-black tracking-tight">
        {setup ? "Подключите приложение" : "Введите код"}
      </h1>
    </>
  );
  return (
    <main className="bo-login mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-md border border-line bg-surface p-6 sm:p-8">
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
                className="mt-4 border-l-2 border-brand bg-brand-soft/40 p-3 text-sm text-copy"
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
                  <div className="bg-white p-2">
                    <Image
                      unoptimized
                      src={setup.qrDataUrl}
                      alt="QR-код для приложения-аутентификатора"
                      width={192}
                      height={192}
                      className="size-48"
                    />
                  </div>
                  <div className="text-sm leading-6 text-copy-muted">
                    <p>
                      Откройте Google Authenticator, Microsoft Authenticator, 1Password или другое
                      совместимое приложение и отсканируйте QR-код.
                    </p>
                    <p className="mt-3 text-xs text-copy-faint">
                      Если камеры нет, введите ключ вручную:
                    </p>
                    <code className="mt-1 block break-all border border-line bg-field p-2 text-xs text-copy">
                      {setup.manualKey}
                    </code>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-copy-muted">
                  Введите шестизначный код из приложения-аутентификатора. Вместо него можно
                  использовать неиспользованный резервный код.
                </p>
              )}
              {message && (
                <p
                  id="two-factor-error"
                  role="alert"
                  aria-live="assertive"
                  className="mt-4 border-l-2 border-brand bg-brand-soft/40 p-3 text-sm text-copy"
                >
                  {message}
                </p>
              )}
            </>
          )}
        </TwoFactorCodeInput>
      </section>
    </main>
  );
}

function Credentials({
  newPassword = false,
  invalid = false,
  errorId,
}: {
  newPassword?: boolean;
  invalid?: boolean;
  errorId?: string;
}) {
  return (
    <>
      {newPassword ? (
        <label className="grid gap-2 text-sm text-copy-muted">
          Имя
          <input
            required
            name="name"
            maxLength={100}
            autoComplete="name"
            aria-invalid={invalid}
            aria-describedby={errorId}
            className="h-11 border bg-field px-3 text-sm text-copy"
          />
        </label>
      ) : null}
      <label className="grid gap-2 text-sm text-copy-muted">
        Логин
        <input
          required
          name="login"
          maxLength={50}
          pattern="[A-Za-z0-9._-]+"
          autoComplete="username"
          aria-invalid={invalid}
          aria-describedby={errorId}
          className="h-11 border bg-field px-3 text-sm text-copy"
        />
      </label>
      <label className="grid gap-2 text-sm text-copy-muted">
        {newPassword ? "Пароль (не менее 12 символов)" : "Пароль"}
        <input
          required
          name="password"
          type="password"
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          autoComplete={newPassword ? "new-password" : "current-password"}
          aria-invalid={invalid}
          aria-describedby={errorId}
          className="h-11 border bg-field px-3 text-sm text-copy"
        />
      </label>
    </>
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
        className="h-9 w-27 object-contain brightness-0 invert"
        priority
      />
      <span className="border-l border-line pl-2 font-days text-sm tracking-wide text-brand">
        BACK OFFICE
      </span>
    </div>
  );
}
const errorMessages: Record<string, string> = {
  "invalid-credentials": "Неверный логин или пароль.",
  "login-rate-limited": "Слишком много попыток входа с этого адреса. Повторите через минуту.",
  "login-account-locked":
    "Слишком много неудачных попыток входа в эту учётную запись. Вход приостановлен на несколько минут — повторите позже.",
  forbidden: "Для входа в back office требуются права администратора.",
  "admin-exists": "Первый администратор уже создан. Войдите с существующей учётной записью.",
  "setup-failed":
    "Не удалось создать администратора. Проверьте данные, bootstrap-секрет и повторите попытку.",
  "two-factor-invalid":
    "Код неверный или уже использован. После пяти попыток потребуется войти заново.",
  "two-factor-attempts-exhausted": "Лимит попыток кода исчерпан. Введите логин и пароль заново.",
  "two-factor-locked":
    "Слишком много неверных кодов для этой учётной записи. Вход временно заблокирован — повторите позже. Если коды вводили не вы, сообщите другому администратору.",
  "two-factor-expired": "Время подтверждения истекло. Войдите снова.",
  "service-unavailable": "Сервер не ответил вовремя. Проверьте соединение и повторите попытку.",
};
function errorMessage(error?: string) {
  return error && Object.hasOwn(errorMessages, error) ? errorMessages[error] : null;
}
async function getBootstrapStatus(): Promise<{
  setupAvailable: boolean;
  setupSecretConfigured: boolean;
}> {
  const unavailable = { setupAvailable: false, setupSecretConfigured: false };
  try {
    const { data } = await createApiClient(process.env.API_URL ?? "http://localhost:4000").GET(
      "/auth/bootstrap-status",
      { cache: "no-store", fetch: timedFetch(8_000) },
    );
    return data?.setupAvailable
      ? { setupAvailable: true, setupSecretConfigured: data.setupSecretConfigured }
      : unavailable;
  } catch {
    return unavailable;
  }
}
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
