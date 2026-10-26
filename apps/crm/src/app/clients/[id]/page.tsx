import Link from "next/link";
import {
  BuildingIcon,
  CalendarIcon,
  ClipboardListIcon,
  MailIcon,
  PhoneIcon,
  UserIcon,
} from "@/components/icons";
import { CustomerRequestsTable } from "@/components/customer-requests-table";
import { CustomerManagement } from "@/components/customer-management";
import { RefreshButton } from "@/components/refresh-button";
import { getCurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/requests";
import { getCustomer } from "@/lib/customers";
import { formatDateTime, fullName } from "@/lib/request-format";
import type { CustomerDetails } from "@/types/customers";
import { requestTypeLabels } from "@/types/requests";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const page = getPage(firstValue(query.page));
  const [result, user] = await Promise.all([
    getCustomer(id, { page, limit: 20 })
      .then((customer) => ({ customer }))
      .catch((error: unknown) => ({
        message:
          error instanceof ApiError && error.status === 404
            ? "Клиент не найден"
            : "Не удалось загрузить данные",
      })),
    getCurrentUser(),
  ]);
  if (!("customer" in result))
    return (
      <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <Link
          href="/clients"
          className="text-sm font-bold text-brand outline-none hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand"
        >
          ← Назад к клиентам
        </Link>
        <div className="mt-8 border-l-2 border-brand bg-white p-5 text-sm text-slate-700">
          {result.message}
        </div>
      </main>
    );
  return (
    <CustomerDetailsView
      customer={result.customer}
      canManagePersonalData={user?.role === "ADMIN"}
    />
  );
}

function CustomerDetailsView({
  customer,
  canManagePersonalData,
}: {
  customer: CustomerDetails;
  canManagePersonalData: boolean;
}) {
  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <Link
        href="/clients"
        className="text-sm font-bold text-brand outline-none transition-colors hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand"
      >
        ← Назад к клиентам
      </Link>
      <header className="mt-6 border-b border-slate-200 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">CRM / Клиенты</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          {fullName(customer)}
        </h1>
        {customer.anonymizedAt ? (
          <p className="mt-3 text-sm font-bold text-slate-600">
            Персональные данные обезличены {formatDateTime(customer.anonymizedAt)}
          </p>
        ) : null}
      </header>
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Клиент</h2>
          <CustomerManagement customer={customer} canManagePersonalData={canManagePersonalData} />
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ParameterCard
            icon={<UserIcon className="size-5" />}
            label="ФИО"
            value={fullName(customer)}
          />
          <ParameterCard
            icon={<BuildingIcon className="size-5" />}
            label="Компания"
            value={customer.company}
          />
          <ParameterCard
            icon={<PhoneIcon className="size-5" />}
            label="Телефон"
            value={
              customer.anonymizedAt ? (
                customer.phone
              ) : (
                <a
                  href={`tel:${phoneHref(customer.phone)}`}
                  className="text-slate-800 outline-none transition-colors duration-200 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {customer.phone}
                </a>
              )
            }
          />
          <ParameterCard
            icon={<MailIcon className="size-5" />}
            label="Почта"
            value={
              customer.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="break-all text-slate-800 outline-none transition-colors duration-200 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {customer.email}
                </a>
              ) : null
            }
          />
          <ParameterCard
            icon={<CalendarIcon className="size-5" />}
            label="Клиент с"
            value={formatDateTime(customer.createdAt)}
          />
          <ParameterCard
            icon={<ClipboardListIcon className="size-5" />}
            label="Всего заявок"
            value={String(customer.requestCount)}
          />
        </dl>
      </section>
      <CustomerConsentHistory customer={customer} />
      <CustomerActivityHistory customer={customer} />
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">История заявок</h2>
            <p className="mt-1 text-sm text-slate-500">
              Всего: {customer.requestsPagination.total}
            </p>
          </div>
          <RefreshButton />
        </div>
        <CustomerRequestsTable requests={customer.requests} />
        <HistoryPagination
          customerId={customer.id}
          page={customer.requestsPagination.page}
          totalPages={customer.requestsPagination.totalPages}
        />
      </section>
    </main>
  );
}

function CustomerConsentHistory({ customer }: { customer: CustomerDetails }) {
  return (
    <section className="mt-8 border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">Согласия</h2>
          <p className="mt-1 text-sm text-slate-500">
            Зафиксированные согласия на обработку персональных данных
          </p>
        </div>
        <span className="text-sm font-bold text-slate-600">Всего: {customer.consents.length}</span>
      </div>
      {customer.consents.length > 0 ? (
        <ol className="mt-5 grid gap-3">
          {customer.consents.map((consent) => (
            <li
              key={consent.id}
              className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-brand pl-4"
            >
              <div>
                <p className="text-sm font-bold text-slate-950">
                  Согласие · версия {consent.documentVersion}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(consent.acceptedAt)} · {requestTypeLabels[consent.request.type]}
                </p>
              </div>
              <Link
                href={`/requests/${consent.request.id}`}
                className="text-sm font-bold text-brand hover:text-brand-dark"
              >
                Заявка № {consent.request.number}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 text-sm text-slate-500">Согласия не зафиксированы.</p>
      )}
    </section>
  );
}

function CustomerActivityHistory({ customer }: { customer: CustomerDetails }) {
  if (customer.activities.length === 0) return null;
  return (
    <section className="mt-8 border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-black tracking-tight text-slate-950">История клиента</h2>
      <ol className="mt-5 grid gap-4">
        {customer.activities.map((activity) => (
          <li key={activity.id} className="border-l-2 border-slate-200 pl-4">
            <p className="text-sm font-bold text-slate-950">
              {activityTitle(activity.type, activity.data)}
            </p>
            <ActivityDetails data={activity.data} type={activity.type} />
            <p className="mt-1 text-sm text-slate-500">
              {activity.user?.name ?? "Сайт"} · {formatDateTime(activity.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
function activityTitle(type: CustomerDetails["activities"][number]["type"], data: unknown) {
  if (type === "CREATED") return "Карточка клиента создана";
  if (type === "REQUEST_ATTACHED")
    return `Добавлена заявка № ${activityString(data, "requestNumber") ?? "—"}`;
  if (type === "MERGED") return "Карточки клиентов объединены";
  if (type === "ANONYMIZED") return "Персональные данные обезличены";
  return "Данные клиента обновлены";
}
function ActivityDetails({
  type,
  data,
}: {
  type: CustomerDetails["activities"][number]["type"];
  data: unknown;
}) {
  if (type === "MERGED") {
    const name = activityString(data, "sourceName");
    const targetContact = activityContact(data, "targetContactBefore");
    const sourceContact = activityContact(data, "sourceContact");
    if (!name && !targetContact && !sourceContact) return null;
    return (
      <div className="mt-1 text-sm text-slate-600">
        {name ? <p>Объединена карточка: {name}</p> : null}
        {targetContact || sourceContact ? (
          <dl className="mt-2 grid gap-2 border-l-2 border-slate-200 pl-3">
            {targetContact ? (
              <div>
                <dt className="text-xs font-bold text-slate-500">Текущая до объединения</dt>
                <dd className="mt-0.5">{contactSummary(targetContact)}</dd>
              </div>
            ) : null}
            {sourceContact ? (
              <div>
                <dt className="text-xs font-bold text-slate-500">Объединённая карточка</dt>
                <dd className="mt-0.5">{contactSummary(sourceContact)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    );
  }
  if (type === "ANONYMIZED") {
    const reason = activityString(data, "reason");
    return reason ? <p className="mt-1 text-sm text-slate-600">Основание: {reason}</p> : null;
  }
  if (
    type !== "UPDATED" ||
    !data ||
    typeof data !== "object" ||
    !("changes" in data) ||
    !data.changes ||
    typeof data.changes !== "object"
  )
    return null;
  const changes = Object.entries(data.changes).filter(
    (entry): entry is [string, { from?: unknown; to?: unknown }] =>
      typeof entry[1] === "object" && entry[1] !== null,
  );
  if (changes.length === 0) return null;
  return (
    <p className="mt-1 text-sm text-slate-600">
      {changes
        .map(
          ([label, value]) => `${label}: ${String(value.from ?? "—")} → ${String(value.to ?? "—")}`,
        )
        .join(" · ")}
    </p>
  );
}
function activityString(data: unknown, key: string) {
  if (!data || typeof data !== "object" || !(key in data)) return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function activityContact(data: unknown, key: string) {
  if (!data || typeof data !== "object" || !(key in data)) return null;
  const value = (data as Record<string, unknown>)[key];
  if (!value || typeof value !== "object") return null;
  const contact = value as Record<string, unknown>;
  return {
    firstName: typeof contact.firstName === "string" ? contact.firstName : null,
    lastName: typeof contact.lastName === "string" ? contact.lastName : null,
    middleName: typeof contact.middleName === "string" ? contact.middleName : null,
    phone: typeof contact.phone === "string" ? contact.phone : null,
    email: typeof contact.email === "string" ? contact.email : null,
    company: typeof contact.company === "string" ? contact.company : null,
  };
}

function contactSummary(contact: {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}) {
  const name = [contact.lastName, contact.firstName, contact.middleName].filter(Boolean).join(" ");
  return [name, contact.phone, contact.email, contact.company].filter(Boolean).join(" · ") || "—";
}

function ParameterCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode | null;
}) {
  if (!value) return null;
  return (
    <div className="min-h-32 border border-slate-200 bg-white p-5 transition-[border-color,box-shadow] duration-200 ease-out hover:border-red-200 hover:shadow-lg hover:shadow-red-950/5">
      {/* A <div> inside <dl> may hold only <dt> and <dd>, so the icon lives in the term. */}
      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        <span className="mb-4 grid size-9 place-items-center bg-red-50 text-brand">{icon}</span>
        {label}
      </dt>
      <dd className="mt-2 text-base leading-6 text-slate-700">{value}</dd>
    </div>
  );
}

function phoneHref(phone: string) {
  return phone.replace(/[^+\d]/g, "");
}

function HistoryPagination({
  customerId,
  page,
  totalPages,
}: {
  customerId: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-5 flex justify-end gap-2">
      <PageLink disabled={page === 1} customerId={customerId} page={page - 1}>
        Назад
      </PageLink>
      <PageLink disabled={page === totalPages} customerId={customerId} page={page + 1}>
        Вперёд
      </PageLink>
    </div>
  );
}

function PageLink({
  children,
  disabled,
  customerId,
  page,
}: {
  children: React.ReactNode;
  disabled: boolean;
  customerId: string;
  page: number;
}) {
  const className =
    "inline-flex min-h-10 items-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand";
  return disabled ? (
    <span className={`${className} cursor-not-allowed border-slate-200 text-slate-400`}>
      {children}
    </span>
  ) : (
    <Link href={`/clients/${customerId}?page=${page}`} className={className}>
      {children}
    </Link>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function getPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
