import Link from "next/link";
import { CalendarIcon, CircleCheckIcon, ClipboardIcon, UserIcon } from "@/components/icons";
import { CartItemsTable } from "@/components/cart-items-table";
import { RequestManagement } from "@/components/request-management";
import { RequestAttention } from "@/components/request-attention";
import { PersonalDataDialog } from "@/components/personal-data-dialog";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, fullName } from "@/lib/request-format";
import { requestTypeLabels, type RequestDetails, type RequestHistoryPages } from "@/types/requests";

const deliveryLabels = { PICKUP: "Самовывоз", DELIVERY: "Доставка" };
const paymentLabels = {
  BANK_TRANSFER: "Банковский перевод",
  ON_RECEIPT: "Оплата при получении",
};

export function RequestDetailsView({
  request,
  historyPages,
  openPersonalData,
}: {
  request: RequestDetails;
  historyPages: RequestHistoryPages;
  openPersonalData: boolean;
}) {
  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <Link
        href={listPathForType(request.type)}
        className="text-sm font-bold text-brand outline-none transition-colors hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand"
      >
        ← Назад к заявкам
      </Link>

      <header className="mt-6 border-b border-slate-200 pb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Заявка № {request.number}
        </h1>
      </header>

      <div className="mt-8 grid gap-6 xl:flex xl:items-start">
        <div className="grid h-fit min-w-0 content-start gap-6 xl:flex-1">
          <section>
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <RequestParameterCard
                icon={<ClipboardIcon className="size-5" />}
                label="Тип"
                value={requestTypeLabels[request.type]}
              />
              <RequestParameterCard
                icon={<CircleCheckIcon className="size-5" />}
                label="Статус"
                value={<StatusBadge status={request.status} />}
              />
              <RequestParameterCard
                icon={<CalendarIcon className="size-5" />}
                label="Дата"
                value={formatDateTime(request.createdAt)}
              />
              <RequestParameterCard
                icon={<CalendarIcon className="size-5" />}
                label="Контроль реакции"
                value={<RequestAttention request={request} />}
              />
            </dl>
          </section>

          <section className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-black tracking-tight text-slate-950">Клиент</h2>
              <div className="flex flex-wrap gap-2">
                <PersonalDataDialog
                  requestId={request.id}
                  consents={request.consents}
                  pagination={request.historyPagination.consents}
                  pages={historyPages}
                  openByDefault={openPersonalData}
                />
                {request.customerId ? (
                  <Link
                    href={`/clients/${request.customerId}`}
                    className="inline-flex min-h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <UserIcon size={18} stroke={1.8} aria-hidden="true" />
                    Открыть клиента
                  </Link>
                ) : null}
              </div>
            </div>
            <dl className="mt-5 grid gap-4">
              <Field label="ФИО" value={fullName(request)} />
              <Field label="Компания" value={request.company} />
              <Field
                label="Телефон"
                value={
                  <a
                    href={`tel:${phoneHref(request.phone)}`}
                    className="text-slate-800 outline-none transition-colors duration-200 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {request.phone}
                  </a>
                }
              />
              <Field
                label="Почта"
                value={
                  request.email ? (
                    <a
                      href={`mailto:${request.email}`}
                      className="break-all text-slate-800 outline-none transition-colors duration-200 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {request.email}
                    </a>
                  ) : null
                }
              />
            </dl>
          </section>

          {request.comment ? (
            <section className="border-l-2 border-brand bg-white p-5">
              <h2 className="text-base font-black text-slate-950">Комментарий клиента</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {request.comment}
              </p>
            </section>
          ) : null}

          <TypeDetails request={request} />
        </div>

        <aside className="grid h-fit min-w-0 gap-6 xl:w-[26rem] xl:shrink-0">
          <RequestManagement
            requestId={request.id}
            status={request.status}
            comments={request.comments}
            activities={request.activities}
            pagination={request.historyPagination}
            pages={historyPages}
          />
        </aside>
      </div>
    </main>
  );
}

function TypeDetails({ request }: { request: RequestDetails }) {
  if (request.type === "CART" && request.cartRequest)
    return <CartDetails request={request.cartRequest} />;
  return null;
}

function CartDetails({ request }: { request: NonNullable<RequestDetails["cartRequest"]> }) {
  const deliveryAddress =
    request.deliveryType === "PICKUP"
      ? "302008, г. Орёл, ул. Машиностроительная, зд. 8"
      : request.deliveryAddress;

  return (
    <section className="min-w-0 max-w-full overflow-hidden border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <h2 className="text-xl font-black tracking-tight text-slate-950">Товары</h2>
      </div>
      <CartItemsTable items={request.items} subtotal={request.subtotal} />
      <dl className="grid gap-4 border-t border-slate-200 p-5">
        <Field label="Способ оплаты" value={paymentLabels[request.paymentType]} />
        <Field label="Способ получения" value={deliveryLabels[request.deliveryType]} />
        {deliveryAddress ? (
          <Field
            label="Адрес"
            value={
              <DeliveryAddress address={deliveryAddress} details={request.deliveryAddressDetails} />
            }
          />
        ) : null}
      </dl>
    </section>
  );
}

function DeliveryAddress({
  address,
  details,
}: {
  address: string;
  details: NonNullable<RequestDetails["cartRequest"]>["deliveryAddressDetails"];
}) {
  if (!details) return <span>{address}</span>;
  const locality = [
    details.postalCode && `Индекс ${details.postalCode}`,
    details.region,
    details.area,
    details.city,
    details.settlement,
  ]
    .filter(Boolean)
    .join(" · ");
  const building = [
    details.street,
    details.house && `д. ${details.house}`,
    details.block && `корп. ${details.block}`,
    details.flat && `кв. ${details.flat}`,
  ]
    .filter(Boolean)
    .join(", ");
  const metadata = [locality, building].filter(Boolean).join("\n");
  return (
    <span className="grid gap-1">
      <span>{address}</span>
      {metadata ? (
        <span className="whitespace-pre-line text-sm text-slate-500">{metadata}</span>
      ) : null}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="w-36 shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </dt>
      <dd className="text-base text-slate-700">{value}</dd>
    </div>
  );
}

function RequestParameterCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
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

function listPathForType(type: RequestDetails["type"]) {
  return type === "CART"
    ? "/requests/cart"
    : type === "CUSTOM"
      ? "/requests/custom"
      : "/requests/wholesale";
}
