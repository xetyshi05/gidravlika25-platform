"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { formatPhone, getLocalPhoneDigits, removePhoneDigitBeforeCursor } from "@/lib/phone-input";
import { HoneypotField } from "@/components/forms/honeypot-field";
import { SpamProtection } from "@/components/forms/spam-protection";
import { FieldMessage as FieldError } from "@/components/forms/field-message";
import { PersonalDataConsent } from "@/components/forms/personal-data-consent";
import { useSuccessReveal } from "@/lib/use-success-reveal";
import {
  PERSONAL_DATA_DOCUMENT_VERSION,
  createCustomRequest,
  createWholesaleRequest,
  getRequestErrorMessage,
} from "@/lib/requests-api";
import { submitWithSpamProtection, type SpamProtectionHandle } from "@/lib/spam-protection";

const inputClassName =
  "h-12 w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors duration-200 ease-out placeholder:text-slate-400 focus:border-brand";
const textareaClassName =
  "min-h-24 w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition-colors duration-200 ease-out placeholder:text-slate-400 focus:border-brand";

type RequestKind = "custom" | "wholesale";
type FieldName = "lastName" | "firstName" | "middleName" | "phone" | "email";
type FieldErrors = Partial<Record<FieldName, string>>;

type CustomProductionFormProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  requestKind?: RequestKind;
  /** Prefilled order comment, e.g. the catalog filters that found nothing. */
  initialComment?: string;
};

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span>
      {children}{" "}
      <span aria-hidden="true" className="text-brand">
        *
      </span>
    </span>
  );
}

function getOptionalText(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value || undefined;
}

function getInputClassName(error?: string) {
  return `${inputClassName} ${error ? "border-brand bg-red-50" : ""}`;
}

export function CustomProductionForm({
  eyebrow = "Заявка на изготовление",
  title = "Оставьте контакты",
  description = "Менеджер свяжется с вами, чтобы уточнить детали обращения и подготовить предложение.",
  requestKind = "custom",
  initialComment,
}: CustomProductionFormProps) {
  const [phone, setPhone] = useState("");
  const [hasPersonalDataConsent, setHasPersonalDataConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hasConsentError, setHasConsentError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const spamProtectionRef = useRef<SpamProtectionHandle>(null);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const isWholesale = requestKind === "wholesale";

  const {
    stage: successStage,
    headingRef,
    reveal: revealSuccess,
  } = useSuccessReveal(requestNumber);

  const copyRequestNumber = async () => {
    if (!requestNumber) return;
    try {
      await navigator.clipboard.writeText(`Гидравлика 25. Заявка №${requestNumber}`);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const middleName = String(formData.get("middleName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const company = getOptionalText(formData, "company");
    const comment = getOptionalText(formData, "orderComment");
    const website = getOptionalText(formData, "website");
    const nextErrors: FieldErrors = {};

    if (!lastName) nextErrors.lastName = "Укажите фамилию";
    if (!firstName) nextErrors.firstName = "Укажите имя";
    if (!middleName) nextErrors.middleName = "Укажите отчество";
    if (getLocalPhoneDigits(phone).length !== 10) {
      nextErrors.phone = "Введите номер полностью";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Введите корректный email";
    }

    const consentError = !hasPersonalDataConsent;
    setErrors(nextErrors);
    setHasConsentError(consentError);

    if (Object.keys(nextErrors).length > 0 || consentError || isSubmitting) {
      const firstInvalidField = Object.keys(nextErrors)[0];
      const invalidControl = firstInvalidField
        ? form.elements.namedItem(firstInvalidField)
        : form.elements.namedItem("personalDataConsent");
      if (invalidControl instanceof HTMLElement) invalidControl.focus();
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      if (isWholesale) {
        const request = await submitWithSpamProtection(spamProtectionRef.current, (altcha) =>
          createWholesaleRequest({
            altcha,
            firstName,
            lastName,
            middleName,
            phone,
            email,
            company,
            comment,
            personalDataConsent: true,
            documentVersion: PERSONAL_DATA_DOCUMENT_VERSION,
            website,
          }),
        );
        setIsCopied(false);
        setRequestNumber(request.number);
        return;
      }

      const request = await submitWithSpamProtection(spamProtectionRef.current, (altcha) =>
        createCustomRequest({
          altcha,
          firstName,
          lastName,
          middleName,
          phone,
          email,
          company,
          comment,
          personalDataConsent: true,
          documentVersion: PERSONAL_DATA_DOCUMENT_VERSION,
          website,
        }),
      );
      setIsCopied(false);
      setRequestNumber(request.number);
    } catch (error) {
      setSubmitError(getRequestErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhone(event.target.value));
    clearFieldError("phone");
    setSubmitError("");
  }

  function clearFieldError(field: FieldName) {
    setErrors((current) => {
      if (!current[field]) return current;
      const remainingErrors = { ...current };
      delete remainingErrors[field];
      return remainingErrors;
    });
  }

  function handlePhoneKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      event.key !== "Backspace" ||
      event.currentTarget.selectionStart !== event.currentTarget.selectionEnd
    )
      return;

    const nextPhone = removePhoneDigitBeforeCursor(
      event.currentTarget.value,
      event.currentTarget.selectionStart ?? 0,
    );
    if (!nextPhone) return;

    event.preventDefault();
    setPhone(nextPhone.value);
    window.requestAnimationFrame(() =>
      event.currentTarget.setSelectionRange(nextPhone.cursor, nextPhone.cursor),
    );
  }

  if (requestNumber) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <div className="grid w-full max-w-2xl justify-items-center text-center">
          <div
            className={`mx-auto grid size-18 place-items-center rounded-full bg-red-50 ${
              successStage >= 1 ? "checkout-success-check" : "opacity-0"
            }`}
          >
            <svg viewBox="0 0 48 48" className="size-11" aria-hidden="true">
              <path
                d="m12 25 8 8 17-18"
                className={successStage >= 1 ? "checkout-success-check-path" : ""}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="5"
              />
            </svg>
          </div>
          <div
            className={`mt-8 ${successStage >= 2 ? "checkout-success-content-enter" : "opacity-0"}`}
            onFocus={(event) => {
              if (event.target !== headingRef.current) revealSuccess();
            }}
          >
            <h2
              ref={headingRef}
              id="custom-production-form-title"
              tabIndex={-1}
              className="text-2xl font-black tracking-tight text-slate-950 outline-none sm:text-3xl"
            >
              Заявка <span className="text-brand">№ {requestNumber}</span>
            </h2>
            <button
              type="button"
              onClick={copyRequestNumber}
              className="mt-5 inline-flex min-h-11 items-center justify-center border border-brand px-5 text-sm font-bold text-brand transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {isCopied ? "Номер скопирован" : "Скопировать номер"}
            </button>
            <p
              id="custom-production-form-description"
              role="status"
              aria-live="polite"
              className="mt-6 text-sm leading-6 text-slate-600"
            >
              Заявка принята. Менеджер свяжется с вами в ближайшее рабочее время. Скопируйте номер
              на всякий случай — он поможет нам быстрее найти вашу заявку.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
        <h2
          id="custom-production-form-title"
          className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl"
        >
          {title}
        </h2>
        <p
          id="custom-production-form-description"
          className="mt-3 text-sm leading-6 text-slate-600"
        >
          {description}
        </p>
      </div>

      <form className="mt-8 grid gap-5" noValidate onSubmit={handleSubmit}>
        <HoneypotField id={`${requestKind}-website`} />
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            <RequiredLabel>Фамилия</RequiredLabel>
            <input
              name="lastName"
              autoComplete="family-name"
              required
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? `${requestKind}-lastName-error` : undefined}
              onChange={() => clearFieldError("lastName")}
              className={getInputClassName(errors.lastName)}
            />
            <FieldError id={`${requestKind}-lastName-error`} message={errors.lastName} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            <RequiredLabel>Имя</RequiredLabel>
            <input
              name="firstName"
              autoComplete="given-name"
              required
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? `${requestKind}-firstName-error` : undefined}
              onChange={() => clearFieldError("firstName")}
              className={getInputClassName(errors.firstName)}
            />
            <FieldError id={`${requestKind}-firstName-error`} message={errors.firstName} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            <RequiredLabel>Отчество</RequiredLabel>
            <input
              name="middleName"
              autoComplete="additional-name"
              required
              aria-invalid={Boolean(errors.middleName)}
              aria-describedby={errors.middleName ? `${requestKind}-middleName-error` : undefined}
              onChange={() => clearFieldError("middleName")}
              className={getInputClassName(errors.middleName)}
            />
            <FieldError id={`${requestKind}-middleName-error`} message={errors.middleName} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Компания
            <input name="company" autoComplete="organization" className={inputClassName} />
            <FieldError />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            <RequiredLabel>Телефон</RequiredLabel>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              value={phone}
              onChange={handlePhoneChange}
              onKeyDown={handlePhoneKeyDown}
              placeholder="+7 (___) ___-__-__"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? `${requestKind}-phone-error` : undefined}
              className={getInputClassName(errors.phone)}
            />
            <FieldError id={`${requestKind}-phone-error`} message={errors.phone} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            <RequiredLabel>Почта</RequiredLabel>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@example.ru"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${requestKind}-email-error` : undefined}
              onChange={() => clearFieldError("email")}
              className={getInputClassName(errors.email)}
            />
            <FieldError id={`${requestKind}-email-error`} message={errors.email} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700 sm:col-span-2 lg:col-span-3">
            Комментарий к заказу
            <textarea
              name="orderComment"
              defaultValue={initialComment}
              placeholder="Укажите детали, которые важно учесть"
              className={textareaClassName}
            />
          </label>
        </div>

        <div>
          <PersonalDataConsent
            id={`personal-data-consent-${requestKind}`}
            checked={hasPersonalDataConsent}
            hasError={hasConsentError}
            onChange={(checked) => {
              setHasPersonalDataConsent(checked);
              setHasConsentError(false);
              setSubmitError("");
            }}
          />
          <div className="mt-5 flex flex-wrap items-start gap-3">
            <SpamProtection ref={spamProtectionRef} />
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="inline-flex min-h-12 cursor-pointer items-center justify-center bg-brand px-6 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              {isSubmitting ? "Отправляем заявку…" : "Отправить заявку"}
            </button>
          </div>
          {submitError ? (
            <p
              id="custom-production-form-error"
              role="alert"
              aria-live="assertive"
              className="mt-4 border-l-2 border-brand bg-red-50 p-4 text-sm leading-6 text-slate-700"
            >
              {submitError}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
