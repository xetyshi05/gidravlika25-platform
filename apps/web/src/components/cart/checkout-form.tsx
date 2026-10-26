"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AddressAutocomplete } from "@/components/cart/address-autocomplete";
import type { CartItem } from "@/components/cart/cart-provider";
import { HoneypotField } from "@/components/forms/honeypot-field";
import { SpamProtection } from "@/components/forms/spam-protection";
import { FieldMessage as FieldError } from "@/components/forms/field-message";
import { PersonalDataConsent } from "@/components/forms/personal-data-consent";
import { formatPhone, getLocalPhoneDigits, removePhoneDigitBeforeCursor } from "@/lib/phone-input";
import {
  PERSONAL_DATA_DOCUMENT_VERSION,
  createCartRequest,
  getRequestErrorMessage,
  type DeliveryAddressDetails,
} from "@/lib/requests-api";
import { submitWithSpamProtection, type SpamProtectionHandle } from "@/lib/spam-protection";

type DeliveryMethod = "pickup" | "delivery";
type PaymentMethod = "bank-transfer" | "on-receipt";
type CheckoutStep = 1 | 2 | 3 | 4;
type FieldName = "lastName" | "firstName" | "middleName" | "phone" | "email" | "address";
type FieldErrors = Partial<Record<FieldName, string>>;
type ReviewData = {
  fullName: string;
  phone: string;
  email: string;
  delivery: string;
  payment: string;
};

const inputClassName =
  "h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors duration-200 ease-out placeholder:text-slate-400 focus:border-brand";
const textareaClassName =
  "min-h-24 w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition-colors duration-200 ease-out placeholder:text-slate-400 focus:border-brand";
const stepLabels = ["Контактные данные", "Доставка", "Оплата", "Проверка"];

type CheckoutFormProps = {
  items: CartItem[];
  onSuccess: (requestNumber: string) => void;
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

export function CheckoutForm({ items, onSuccess }: CheckoutFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<CheckoutStep>(1);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank-transfer");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hasPersonalDataConsent, setHasPersonalDataConsent] = useState(false);
  const [hasConsentError, setHasConsentError] = useState(false);
  const [deliveryAddressDetails, setDeliveryAddressDetails] =
    useState<DeliveryAddressDetails | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const spamProtectionRef = useRef<SpamProtectionHandle>(null);

  const getInputClassName = (error?: string) =>
    `${inputClassName} ${error ? "border-brand bg-red-50" : ""}`;
  const clearFieldError = (field: FieldName) =>
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

  const validate = (validationSteps: CheckoutStep[]) => {
    const form = formRef.current;
    if (!form) return false;
    const formData = new FormData(form);
    const nextErrors: FieldErrors = {};

    if (validationSteps.includes(1)) {
      for (const [field, message] of [
        ["lastName", "Укажите фамилию"],
        ["firstName", "Укажите имя"],
        ["middleName", "Укажите отчество"],
      ] as const) {
        if (!String(formData.get(field) ?? "").trim()) nextErrors[field] = message;
      }
      if (getLocalPhoneDigits(phone).length !== 10) nextErrors.phone = "Введите номер полностью";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(formData.get("email") ?? "").trim())) {
        nextErrors.email = "Введите корректный email";
      }
    }
    if (validationSteps.includes(2) && deliveryMethod === "delivery") {
      if (!String(formData.get("address") ?? "").trim()) nextErrors.address = "Укажите адрес";
    }

    const consentError = validationSteps.includes(4) && !hasPersonalDataConsent;
    setErrors(nextErrors);
    setHasConsentError(consentError);
    return Object.keys(nextErrors).length === 0 && !consentError;
  };

  const createReview = () => {
    const formData = formRef.current ? new FormData(formRef.current) : new FormData();
    const address = String(formData.get("address") ?? "").trim();
    return {
      fullName: ["lastName", "firstName", "middleName"]
        .map((field) => String(formData.get(field) ?? "").trim())
        .filter(Boolean)
        .join(" "),
      phone,
      email: String(formData.get("email") ?? "").trim(),
      delivery: deliveryMethod === "pickup" ? "Самовывоз со склада в Орле" : `Доставка: ${address}`,
      payment: paymentMethod === "bank-transfer" ? "Банковский перевод" : "Оплата при получении",
    };
  };

  const goToNextStep = () => {
    if (!validate([step])) return;
    if (step === 3) setReview(createReview());
    setStep((current) => (current + 1) as CheckoutStep);
    setSubmitError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !validate([1, 2, 4])) return;
    const formData = new FormData(event.currentTarget);
    const address = String(formData.get("address") ?? "").trim() || undefined;
    const addressDetails = String(formData.get("addressDetails") ?? "").trim() || undefined;
    const deliveryAddress = [address, addressDetails].filter(Boolean).join(", ") || undefined;

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const request = await submitWithSpamProtection(spamProtectionRef.current, (altcha) =>
        createCartRequest({
          altcha,
          firstName: String(formData.get("firstName") ?? "").trim(),
          lastName: String(formData.get("lastName") ?? "").trim(),
          middleName: String(formData.get("middleName") ?? "").trim(),
          phone,
          email: String(formData.get("email") ?? "").trim(),
          company: String(formData.get("company") ?? "").trim() || undefined,
          comment: String(formData.get("orderComment") ?? "").trim() || undefined,
          deliveryType: deliveryMethod === "pickup" ? "PICKUP" : "DELIVERY",
          ...(deliveryMethod === "delivery"
            ? { deliveryAddress, ...(deliveryAddressDetails ? { deliveryAddressDetails } : {}) }
            : {}),
          paymentType: paymentMethod === "bank-transfer" ? "BANK_TRANSFER" : "ON_RECEIPT",
          personalDataConsent: true,
          documentVersion: PERSONAL_DATA_DOCUMENT_VERSION,
          website: String(formData.get("website") ?? "").trim() || undefined,
          items: items.map((item) => ({ productId: item.id, quantity: item.quantity })),
        }),
      );
      onSuccess(request.number);
    } catch (error) {
      setSubmitError(getRequestErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(event.target.value));
    clearFieldError("phone");
    setSubmitError("");
  };

  const handlePhoneKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
  };

  return (
    <section className="mx-auto max-w-240 px-4 py-10 sm:px-6 lg:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Оформление заявки</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
        Оформление заявки
      </h1>
      <ol className="relative mt-8 grid grid-cols-4 gap-2" aria-label="Шаги оформления заявки">
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-4 h-px bg-slate-200"
        />
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] top-4 h-px bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${((step - 1) / 3) * 75}%` }}
        />
        {stepLabels.map((label, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === step;
          return (
            <li key={label} className="relative grid justify-items-center gap-2 text-center">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`grid size-8 place-items-center rounded-full text-sm font-black transition-all duration-300 ${
                  isCurrent
                    ? "scale-110 bg-brand text-white shadow-lg shadow-red-950/15"
                    : stepNumber < step
                      ? "bg-brand text-white"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {stepNumber}
              </span>
              <span
                className={`hidden text-xs font-bold sm:block ${isCurrent ? "text-slate-950" : "text-slate-500"}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <form
        ref={formRef}
        className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5 sm:p-8"
        noValidate
        onSubmit={handleSubmit}
      >
        <HoneypotField id="checkout-website" />
        <div className={step === 1 ? "block" : "hidden"}>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Контактные данные</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Укажите данные, по которым менеджер сможет связаться с вами.
          </p>
          <div className="mt-8 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <RequiredLabel>Фамилия</RequiredLabel>
              <input
                name="lastName"
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? "checkout-lastName-error" : undefined}
                autoComplete="family-name"
                onChange={() => clearFieldError("lastName")}
                className={getInputClassName(errors.lastName)}
              />
              <FieldError id="checkout-lastName-error" message={errors.lastName} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <RequiredLabel>Имя</RequiredLabel>
              <input
                name="firstName"
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? "checkout-firstName-error" : undefined}
                autoComplete="given-name"
                onChange={() => clearFieldError("firstName")}
                className={getInputClassName(errors.firstName)}
              />
              <FieldError id="checkout-firstName-error" message={errors.firstName} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <RequiredLabel>Отчество</RequiredLabel>
              <input
                name="middleName"
                aria-invalid={Boolean(errors.middleName)}
                aria-describedby={errors.middleName ? "checkout-middleName-error" : undefined}
                autoComplete="additional-name"
                onChange={() => clearFieldError("middleName")}
                className={getInputClassName(errors.middleName)}
              />
              <FieldError id="checkout-middleName-error" message={errors.middleName} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <RequiredLabel>Номер телефона</RequiredLabel>
              <input
                name="phone"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "checkout-phone-error" : undefined}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={handlePhoneChange}
                onKeyDown={handlePhoneKeyDown}
                placeholder="+7 (___) ___-__-__"
                className={getInputClassName(errors.phone)}
              />
              <FieldError id="checkout-phone-error" message={errors.phone} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <RequiredLabel>Почта</RequiredLabel>
              <input
                name="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "checkout-email-error" : undefined}
                type="email"
                autoComplete="email"
                onChange={() => clearFieldError("email")}
                placeholder="name@example.ru"
                className={getInputClassName(errors.email)}
              />
              <FieldError id="checkout-email-error" message={errors.email} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Компания
              <input name="company" autoComplete="organization" className={inputClassName} />
              <FieldError />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700 sm:col-span-2 lg:col-span-3">
              Комментарий к заявке
              <textarea
                name="orderComment"
                placeholder="Например, параметры, количество или удобное время для связи"
                className={textareaClassName}
              />
            </label>
          </div>
        </div>

        <div className={step === 2 ? "block" : "hidden"}>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Способ доставки</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 border p-4 transition-colors ${
                deliveryMethod === "pickup"
                  ? "border-brand bg-red-50"
                  : "border-slate-300 hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="deliveryMethod"
                value="pickup"
                checked={deliveryMethod === "pickup"}
                onChange={() => setDeliveryMethod("pickup")}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-bold text-slate-950">Самовывоз</span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">
                  Получение заказа со склада после согласования с менеджером.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 border p-4 transition-colors ${
                deliveryMethod === "delivery"
                  ? "border-brand bg-red-50"
                  : "border-slate-300 hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="deliveryMethod"
                value="delivery"
                checked={deliveryMethod === "delivery"}
                onChange={() => setDeliveryMethod("delivery")}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-bold text-slate-950">Доставка</span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">
                  Подберём удобный способ отправки по вашему адресу.
                </span>
              </span>
            </label>
          </div>
          {deliveryMethod === "pickup" ? (
            <div className="mt-5 border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-base font-black text-slate-950">Склад в Орле</h3>
              <address className="mt-3 not-italic text-sm leading-6 text-slate-700">
                302008, г. Орёл, ул. Машиностроительная, зд. 8 · Понедельник–пятница, 08:00–17:00
              </address>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                <RequiredLabel>Адрес</RequiredLabel>
                <AddressAutocomplete
                  error={errors.address}
                  inputClassName={getInputClassName(errors.address)}
                  onChange={() => {
                    setDeliveryAddressDetails(null);
                    clearFieldError("address");
                  }}
                  onSuggestionSelect={setDeliveryAddressDetails}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Дополнительная информация по адресу
                <input
                  name="addressDetails"
                  autoComplete="address-line2"
                  className={inputClassName}
                />
                <FieldError />
              </label>
            </div>
          )}
        </div>

        <div className={step === 3 ? "block" : "hidden"}>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Способ оплаты</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-center gap-3 border p-4 transition-colors ${
                paymentMethod === "bank-transfer"
                  ? "border-brand bg-red-50"
                  : "border-slate-300 hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="bank-transfer"
                checked={paymentMethod === "bank-transfer"}
                onChange={() => setPaymentMethod("bank-transfer")}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm font-bold text-slate-950">Банковский перевод</span>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 border p-4 transition-colors ${
                paymentMethod === "on-receipt"
                  ? "border-brand bg-red-50"
                  : "border-slate-300 hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="on-receipt"
                checked={paymentMethod === "on-receipt"}
                onChange={() => setPaymentMethod("on-receipt")}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm font-bold text-slate-950">Оплата при получении</span>
            </label>
          </div>
        </div>

        <div className={step === 4 ? "block" : "hidden"}>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Проверьте данные</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="border border-slate-200 p-4 text-sm">
              <p className="text-slate-500">Контактные данные</p>
              <p className="mt-2 font-bold text-slate-950">{review?.fullName}</p>
              <p className="mt-1 text-slate-700">
                {review?.phone} · {review?.email}
              </p>
            </div>
            <div className="border border-slate-200 p-4 text-sm">
              <p className="text-slate-500">Получение и оплата</p>
              <p className="mt-2 font-bold text-slate-950">{review?.delivery}</p>
              <p className="mt-1 text-slate-700">{review?.payment}</p>
            </div>
          </div>
          <div className="mt-4 border border-slate-200 p-4">
            <h3 className="text-sm font-black text-slate-950">Товары в заявке</h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700">
              {items.map((item) => (
                <li key={item.slug} className="flex justify-between gap-4">
                  <span>{item.name}</span>
                  <span className="shrink-0 font-bold">{item.quantity} шт.</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-5">
            <PersonalDataConsent
              id="checkout-personal-data-consent"
              checked={hasPersonalDataConsent}
              hasError={hasConsentError}
              onChange={(checked) => {
                setHasPersonalDataConsent(checked);
                setHasConsentError(false);
                setSubmitError("");
              }}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => (current - 1) as CheckoutStep)}
              className="inline-flex min-h-11 items-center justify-center border border-slate-300 px-5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-950 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-brand"
            >
              Назад
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex flex-wrap items-start justify-end gap-3">
            {/* Keep the widget mounted so a completed check survives step changes. */}
            <div className={step === 4 ? "block" : "hidden"}>
              <SpamProtection ref={spamProtectionRef} className="spam-protection--checkout" />
            </div>
            {step < 4 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  goToNextStep();
                }}
                className="inline-flex min-h-11 items-center justify-center bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Продолжить
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="inline-flex min-h-11 items-center justify-center bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {isSubmitting ? "Отправляем заявку…" : "Оформить заявку"}
              </button>
            )}
          </div>
        </div>
        {submitError ? (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-4 border-l-2 border-brand bg-red-50 p-4 text-sm leading-6 text-slate-700"
          >
            {submitError}
          </p>
        ) : null}
      </form>
    </section>
  );
}
