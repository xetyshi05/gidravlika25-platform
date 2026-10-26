"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { TwoFactorActionState } from "@/app/auth-actions";

const CODE_LENGTH = 6;
const emptyDigits = () => Array<string>(CODE_LENGTH).fill("");

/**
 * The 2FA step. `children` (heading, QR code, server message) is replaced by the
 * recovery codes when the action returns them after setup.
 */
export function TwoFactorCodeInput({
  action,
  invalid = false,
  errorId,
  setup = false,
  expired = false,
  recoveryMode = false,
  children,
}: {
  action: (state: TwoFactorActionState, formData: FormData) => Promise<TwoFactorActionState>;
  invalid?: boolean;
  errorId?: string;
  /** First-time setup: a rejected code returns to the screen with the QR code. */
  setup?: boolean;
  /** The challenge is gone: show only `children`. Stays mounted so returned codes survive. */
  expired?: boolean;
  /** Start in recovery-code mode (kept across a rejected attempt). */
  recoveryMode?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const [useRecoveryCode, setUseRecoveryCode] = useState(recoveryMode);
  const [clientError, setClientError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const submitted = useRef(false);
  const wasPending = useRef(false);

  const focus = (index: number) =>
    inputs.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))]?.focus();
  const fill = (value: string, start = 0) => {
    const next = [...digits];
    const values = value
      .replace(/\D/g, "")
      .slice(0, CODE_LENGTH - start)
      .split("");
    values.forEach((digit, offset) => {
      next[start + offset] = digit;
    });
    setDigits(next);
    setClientError("");
    focus(Math.min(start + values.length, CODE_LENGTH - 1));
  };

  function handleChange(index: number, value: string) {
    const values = value.replace(/\D/g, "");
    if (!values) {
      setDigits((current) => current.map((digit, position) => (position === index ? "" : digit)));
      setClientError("");
      return;
    }
    fill(values, index);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    const value = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!value) return;
    event.preventDefault();
    fill(value, index);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((current) =>
        current.map((digit, position) => (position === index - 1 ? "" : digit)),
      );
      focus(index - 1);
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focus(index - 1);
    }
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      focus(index + 1);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (useRecoveryCode) return;
    if (digits.some((digit) => !digit)) {
      event.preventDefault();
      setClientError("Введите все шесть цифр кода.");
      focus(digits.findIndex((digit) => !digit));
    }
  }

  useEffect(() => {
    if (digits.some((digit) => !digit)) {
      submitted.current = false;
      return;
    }
    if (useRecoveryCode || submitted.current) return;
    submitted.current = true;
    form.current?.requestSubmit();
  }, [digits, useRecoveryCode]);

  // A rejected code redirects back to this page, so the component survives:
  // clear the fields once the attempt settles so the next code can be entered.
  useEffect(() => {
    const settled = wasPending.current && !pending;
    wasPending.current = pending;
    if (!settled || state) return;
    form.current?.reset();
    setDigits(emptyDigits());
    submitted.current = false;
    if (useRecoveryCode) form.current?.querySelector<HTMLInputElement>('[name="code"]')?.focus();
    else inputs.current[0]?.focus();
  }, [pending, state, useRecoveryCode]);

  // Saving the session re-renders this page without a challenge (`expired`);
  // the codes live in this component's state and must win over that.
  if (state) return <RecoveryCodes codes={state.recoveryCodes} next={state.next} />;
  if (expired) return children;

  const descriptionId =
    [errorId, clientError ? "two-factor-code-incomplete" : undefined].filter(Boolean).join(" ") ||
    undefined;

  return (
    <>
      {children}
      <form
        ref={form}
        action={formAction}
        onSubmit={handleSubmit}
        aria-busy={pending}
        className="mt-6 grid gap-4"
      >
        {setup ? <input type="hidden" name="setup" value="1" /> : null}
        {useRecoveryCode ? <input type="hidden" name="method" value="recovery" /> : null}
        {useRecoveryCode ? (
          <label className="grid gap-2 text-sm text-copy-muted">
            Резервный код
            <input
              required
              autoFocus
              name="code"
              autoComplete="one-time-code"
              maxLength={32}
              aria-invalid={invalid}
              aria-describedby={errorId}
              className="h-12 rounded-md border border-line bg-field px-3 font-mono text-base uppercase text-copy focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
        ) : (
          <div>
            <div
              className="flex justify-center gap-2"
              role="group"
              aria-label="Шестизначный код из приложения"
              aria-describedby={descriptionId}
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputs.current[index] = element;
                  }}
                  aria-label={`Цифра ${index + 1} из ${CODE_LENGTH}`}
                  aria-invalid={invalid || Boolean(clientError)}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  autoFocus={index === 0}
                  inputMode="numeric"
                  maxLength={CODE_LENGTH}
                  pattern="[0-9]*"
                  value={digit}
                  onChange={(event) => handleChange(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onPaste={(event) => handlePaste(event, index)}
                  className="size-10 rounded-md border border-line bg-field text-center text-xl font-bold tabular-nums text-copy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:size-12"
                />
              ))}
            </div>
            <input name="code" type="hidden" value={digits.join("")} />
            {clientError ? (
              <p id="two-factor-code-incomplete" role="alert" className="mt-2 text-sm text-red-300">
                {clientError}
              </p>
            ) : null}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setUseRecoveryCode((current) => !current);
            setClientError("");
          }}
          className="justify-self-center text-xs font-medium text-copy-faint hover:text-copy-muted"
        >
          {useRecoveryCode ? "Ввести код из приложения" : "Использовать резервный код"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Проверяем…" : "Подтвердить"}
        </button>
      </form>
    </>
  );
}

function RecoveryCodes({ codes, next }: { codes: string[]; next: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => heading.current?.focus(), []);
  return (
    <>
      <p className="mt-6 text-xs font-semibold tracking-[.14em] text-brand">РЕЗЕРВНЫЕ КОДЫ</p>
      <h1
        ref={heading}
        tabIndex={-1}
        className="mt-2 text-3xl font-black tracking-tight outline-none"
      >
        Сохраните коды
      </h1>
      <p className="mt-3 text-sm leading-6 text-copy-muted">
        Они помогут войти, если приложение-аутентификатор будет недоступно. Каждый код используется
        только один раз. Коды показываются один раз: после перехода их нельзя будет посмотреть
        снова, только выпустить новые.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2 border border-line bg-field p-4 font-mono text-sm text-copy">
        {codes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(codes.join("\n")).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
        className="mt-3 text-sm font-bold text-copy-muted underline underline-offset-4 hover:text-brand"
      >
        {copied ? "Скопировано" : "Скопировать коды"}
      </button>
      <Link
        href={next}
        replace
        className="mt-6 flex min-h-11 w-full items-center justify-center bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
      >
        Я сохранил коды
      </Link>
    </>
  );
}
