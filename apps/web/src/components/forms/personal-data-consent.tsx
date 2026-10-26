import Link from "next/link";
import { FieldMessage } from "@/components/forms/field-message";

type PersonalDataConsentProps = {
  id: string;
  checked: boolean;
  hasError: boolean;
  onChange: (checked: boolean) => void;
};

export function PersonalDataConsent({ id, checked, hasError, onChange }: PersonalDataConsentProps) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-start gap-3 text-sm leading-5 text-slate-600">
        <input
          id={id}
          name="personalDataConsent"
          type="checkbox"
          required
          aria-labelledby={`${id}-label`}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="consent-checkbox mt-px size-[18px] shrink-0"
        />
        <p id={`${id}-label`}>
          <label className="cursor-pointer" htmlFor={id}>
            Я даю{" "}
          </label>
          <Link
            href="/personal-data-consent"
            target="_blank"
            rel="noopener noreferrer"
            className="consent-link font-bold text-brand"
          >
            согласие на обработку персональных данных
          </Link>{" "}
          и подтверждаю, что ознакомлен(а) с{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="consent-link font-bold text-brand"
          >
            Политикой обработки персональных данных
          </Link>
          .
        </p>
      </div>
      <FieldMessage
        id={`${id}-error`}
        message={hasError ? "Подтвердите согласие на обработку персональных данных" : undefined}
        reserveMessage="Подтвердите согласие на обработку персональных данных"
      />
    </div>
  );
}
