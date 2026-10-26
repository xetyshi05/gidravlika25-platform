"use client";

import { useActionState, useRef, useState } from "react";
import { IconDownload, IconEdit, IconGitMerge, IconUserOff, IconX } from "@tabler/icons-react";
import {
  anonymizeCustomer,
  mergeCustomer,
  updateCustomer,
  type CustomerActionState,
} from "@/app/clients/[id]/actions";
import { fullName } from "@/lib/request-format";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import type { CustomerDetails, CustomerDuplicate } from "@/types/customers";
import { ActionMessage } from "@/components/action-message";

const initialState: CustomerActionState = {};
type MergeFieldName = "firstName" | "lastName" | "middleName" | "phone" | "email" | "company";
type MergeField = { name: MergeFieldName; label: string };
const mergeFields: MergeField[] = [
  { name: "firstName", label: "Имя" },
  { name: "lastName", label: "Фамилия" },
  { name: "middleName", label: "Отчество" },
  { name: "phone", label: "Телефон" },
  { name: "email", label: "Почта" },
  { name: "company", label: "Компания" },
];

export function CustomerManagement({
  customer,
  canManagePersonalData,
}: {
  customer: CustomerDetails;
  canManagePersonalData: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [candidate, setCandidate] = useState<CustomerDuplicate | null>(null);
  const [anonymizing, setAnonymizing] = useState(false);
  const updateAction = updateCustomer.bind(null, customer.id);
  const mergeAction = mergeCustomer.bind(null, customer.id);
  const anonymizeAction = anonymizeCustomer.bind(null, customer.id);
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, initialState);
  const [mergeState, mergeFormAction, mergePending] = useActionState(mergeAction, initialState);
  const [anonymizeState, anonymizeFormAction, anonymizePending] = useActionState(
    anonymizeAction,
    initialState,
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!customer.anonymizedAt ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
          >
            <IconEdit className="size-5" />
            Редактировать
          </button>
        ) : null}
        {canManagePersonalData ? (
          <a
            href={`/api/customers/${customer.id}/personal-data`}
            download
            className="inline-flex min-h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
          >
            <IconDownload className="size-5" />
            Экспорт данных
          </a>
        ) : null}
        {canManagePersonalData && !customer.anonymizedAt ? (
          <button
            type="button"
            onClick={() => setAnonymizing(true)}
            className="inline-flex min-h-10 items-center gap-2 border border-brand bg-white px-4 text-sm font-bold text-brand hover:bg-red-50"
          >
            <IconUserOff className="size-5" />
            Обезличить
          </button>
        ) : null}
      </div>
      {!customer.anonymizedAt && customer.potentialDuplicates.length > 0 ? (
        <section className="mt-6 border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-black tracking-tight text-slate-950">Возможные дубликаты</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Контакты оставлены раздельно: совпадения телефона или почты недостаточно для
            автоматического объединения. Сверьте данные и подтвердите объединение вручную.
          </p>
          <ul className="mt-4 grid gap-3">
            {customer.potentialDuplicates.map((duplicate) => (
              <li
                key={duplicate.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-white p-4"
              >
                <div>
                  <p className="font-bold text-slate-950">{fullName(duplicate)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {duplicate.phone}
                    {duplicate.email ? ` · ${duplicate.email}` : ""} · заявок:{" "}
                    {duplicate.requestCount}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCandidate(duplicate)}
                  className="inline-flex min-h-10 items-center gap-2 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
                >
                  <IconGitMerge className="size-5" />
                  Объединить
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {editing ? (
        <Dialog title="Редактирование клиента" onClose={() => setEditing(false)}>
          {/* Remounts with fresh values after "Обновить данные", so a retry cannot resend stale fields. */}
          <form key={customer.updatedAt} action={updateFormAction} className="grid gap-4">
            <input type="hidden" name="expectedUpdatedAt" value={customer.updatedAt} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя" name="firstName" defaultValue={customer.firstName} required />
              <Field label="Фамилия" name="lastName" defaultValue={customer.lastName} required />
            </div>
            <Field label="Отчество" name="middleName" defaultValue={customer.middleName ?? ""} />
            <Field label="Телефон" name="phone" defaultValue={customer.phone} required type="tel" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Почта" name="email" defaultValue={customer.email ?? ""} type="email" />
              <Field label="Компания" name="company" defaultValue={customer.company ?? ""} />
            </div>
            <ActionMessage state={updateState} />
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={updatePending}
                className="min-h-10 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
              >
                Закрыть
              </button>
              <button
                type="submit"
                disabled={updatePending}
                className="min-h-10 border border-brand bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {updatePending ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {candidate ? (
        <Dialog title="Объединить карточки?" onClose={() => setCandidate(null)}>
          <form action={mergeFormAction}>
            <input type="hidden" name="sourceCustomerId" value={candidate.id} />
            <p className="text-sm leading-6 text-slate-600">
              Заявки и история клиента «{fullName(candidate)}» перейдут в текущую карточку. Исходная
              карточка будет удалена, а её контакты сохранятся в истории объединения.
            </p>
            <MergeConflictResolution customer={customer} candidate={candidate} />
            <ActionMessage state={mergeState} />
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCandidate(null)}
                disabled={mergePending}
                className="min-h-10 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
              >
                Не объединять
              </button>
              <button
                type="submit"
                disabled={mergePending}
                className="inline-flex min-h-10 items-center justify-center gap-2 border border-brand bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                <IconGitMerge className="size-5" />
                {mergePending ? "Объединяем…" : "Подтвердить"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {anonymizing ? (
        <Dialog title="Обезличить персональные данные?" onClose={() => setAnonymizing(false)}>
          <form action={anonymizeFormAction} className="grid gap-4">
            <p className="text-sm leading-6 text-slate-600">
              Контакты, адрес доставки и свободные комментарии будут необратимо удалены из карточки
              и всех связанных заявок. Номера, даты, статусы, состав и стоимость заказов, а также
              даты и версии согласий сохранятся.
            </p>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Основание
              <textarea
                name="reason"
                required
                maxLength={500}
                placeholder="Например: заявление субъекта персональных данных от 09.09.2026"
                className="min-h-24 resize-y border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-brand"
              />
              <span className="text-xs font-normal leading-5 text-slate-500">
                Не указывайте здесь лишние персональные данные.
              </span>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Для подтверждения введите ОБЕЗЛИЧИТЬ
              <input
                name="confirmation"
                required
                autoComplete="off"
                className="min-h-11 border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand"
              />
            </label>
            <ActionMessage state={anonymizeState} />
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAnonymizing(false)}
                disabled={anonymizePending}
                className="min-h-10 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={anonymizePending}
                className="inline-flex min-h-10 items-center justify-center gap-2 border border-brand bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                <IconUserOff className="size-5" />
                {anonymizePending ? "Обезличиваем…" : "Обезличить необратимо"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

function MergeConflictResolution({
  customer,
  candidate,
}: {
  customer: CustomerDetails;
  candidate: CustomerDuplicate;
}) {
  const conflicts = mergeFields.filter((field) => {
    const targetValue = comparableContactValue(field.name, customer[field.name]);
    const sourceValue = comparableContactValue(field.name, candidate[field.name]);
    return targetValue !== sourceValue && targetValue !== "" && sourceValue !== "";
  });

  if (conflicts.length === 0) {
    return (
      <p className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        Конфликтов нет: пустые поля будут заполнены из объединяемой карточки.
      </p>
    );
  }

  return (
    <div className="mt-5 grid gap-4">
      <p className="text-sm font-bold text-slate-950">
        Выберите значения, которые останутся в карточке:
      </p>
      {conflicts.map((field) => (
        <fieldset key={field.name} className="border border-amber-200 bg-amber-50 p-4">
          <legend className="px-1 text-sm font-black text-slate-950">{field.label}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <MergeValueOption
              name={`${field.name}Selection`}
              value="TARGET"
              label="Текущая карточка"
              contactValue={customer[field.name]}
            />
            <MergeValueOption
              name={`${field.name}Selection`}
              value="SOURCE"
              label="Объединяемая карточка"
              contactValue={candidate[field.name]}
            />
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function MergeValueOption({
  name,
  value,
  label,
  contactValue,
}: {
  name: string;
  value: "TARGET" | "SOURCE";
  label: string;
  contactValue: string | null;
}) {
  return (
    <label className="flex cursor-pointer gap-3 border border-slate-200 bg-white p-3 text-sm transition-colors hover:border-brand">
      <input
        type="radio"
        name={name}
        value={value}
        required
        className="mt-0.5 size-4 shrink-0 accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className="mt-1 block break-words font-bold text-slate-950">{contactValue}</span>
      </span>
    </label>
  );
}

function comparableContactValue(field: MergeFieldName, value: string | null) {
  const normalized = value?.trim().toLocaleLowerCase("ru-RU") ?? "";
  if (field !== "phone") return normalized;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={type === "email" ? 254 : 200}
        className="min-h-11 border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand"
      />
    </label>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(dialogRef, onClose);
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="crm-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-dialog-title"
        tabIndex={-1}
        className="crm-modal-panel relative max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto border border-slate-200 bg-white p-6 shadow-xl outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-4 top-4 grid size-9 place-items-center text-slate-500 hover:text-brand"
        >
          <IconX className="size-5" />
        </button>
        <h2
          id="customer-dialog-title"
          className="pr-10 text-xl font-black tracking-tight text-slate-950"
        >
          {title}
        </h2>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
