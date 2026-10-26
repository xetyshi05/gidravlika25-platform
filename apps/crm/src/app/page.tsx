import Link from "next/link";
import { BuildingIcon, CartIcon, ClipboardIcon, ToolIcon } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { RefreshButton } from "@/components/refresh-button";
import { RecentRequestsTable } from "@/components/recent-requests-table";
import { getRequests, getRequestStats } from "@/lib/requests";
import { type RequestStats, type RequestsPage } from "@/types/requests";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboard = await Promise.all([getRequestStats(), getRequests({ page: 1, limit: 5 })])
    .then(([stats, recent]) => ({ stats, recent }))
    .catch(() => null);

  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <PageHeading eyebrow="CRM" title="Главная" description="Краткий обзор новых обращений." />
      {dashboard ? (
        <Dashboard stats={dashboard.stats} recent={dashboard.recent} />
      ) : (
        <div className="mt-8 border-l-2 border-brand bg-white p-5">
          <p className="text-sm font-bold text-slate-950">Не удалось загрузить данные</p>
          <Link
            href="/"
            className="mt-3 inline-flex min-h-10 items-center border border-brand bg-white px-4 text-sm font-bold text-brand transition-colors hover:bg-brand hover:text-white"
          >
            Повторить
          </Link>
        </div>
      )}
    </main>
  );
}

function Dashboard({ stats, recent }: { stats: RequestStats; recent: RequestsPage }) {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusStat label="Новые" value={stats.new} tone="brand" />
        <StatusStat label="В работе" value={stats.inProgress} tone="amber" />
        <StatusStat label="Связались" value={stats.contacted} tone="sky" />
        <StatusStat label="Завершены" value={stats.completed} tone="emerald" />
      </div>
      <section className="mt-8 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-5">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Последние заявки</h2>
            <p className="mt-1 text-sm text-slate-600">Новые и недавно созданные обращения.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <RefreshButton />
            <Link
              href="/requests"
              className="inline-flex min-h-10 items-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand"
            >
              Посмотреть все заявки
            </Link>
          </div>
        </div>
        <RecentRequestsTable recent={recent} />
      </section>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <RequestTypesCard stats={stats} />
        <AttentionCard stats={stats} />
      </div>
    </>
  );
}

function StatusStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "amber" | "sky" | "emerald";
}) {
  const toneClassNames = {
    brand: "border-brand bg-red-50",
    amber: "border-amber-400 bg-amber-50",
    sky: "border-sky-400 bg-sky-50",
    emerald: "border-emerald-400 bg-emerald-50",
  };
  return (
    <section className={`border border-slate-200 border-t-2 p-5 ${toneClassNames[tone]}`}>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
    </section>
  );
}

function RequestTypesCard({ stats }: { stats: RequestStats }) {
  return (
    <section className="border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-black tracking-tight text-slate-950">По типам заявок</h2>
      <dl className="mt-5 divide-y divide-slate-200">
        <SummaryRow icon={<CartIcon className="size-5" />} label="Из корзины" value={stats.cart} />
        <SummaryRow
          icon={<ToolIcon className="size-5" />}
          label="Изготовление на заказ"
          value={stats.custom}
        />
        <SummaryRow
          icon={<BuildingIcon className="size-5" />}
          label="Оптовые закупки"
          value={stats.wholesale}
        />
        <SummaryRow
          icon={<ClipboardIcon className="size-5" />}
          label="Всего заявок"
          value={stats.total}
          total
        />
      </dl>
    </section>
  );
}

function AttentionCard({ stats }: { stats: RequestStats }) {
  const total = stats.new + stats.inProgress;
  return (
    <section className="border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-black tracking-tight text-slate-950">Требуют внимания</h2>
      <p className="mt-1 text-sm text-slate-600">Заявки, ожидающие действий менеджера.</p>
      <dl className="mt-5 divide-y divide-slate-200">
        <SummaryRow label="Непрочитанные лично вами" value={stats.unread} />
        <SummaryRow label="SLA первичной реакции просрочен" value={stats.overdue} />
        <SummaryRow label="Новые — нужно взять в работу" value={stats.new} />
        <SummaryRow label="В работе — ожидают следующего шага" value={stats.inProgress} />
        <SummaryRow label="Всего в обработке" value={total} total />
      </dl>
    </section>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  total = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  total?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${total ? "text-slate-950" : "text-slate-700"}`}
    >
      <dt className={`flex min-w-0 items-center gap-3 text-sm ${total ? "font-bold" : ""}`}>
        {icon ? <span className="shrink-0 text-slate-500">{icon}</span> : null}
        <span>{label}</span>
      </dt>
      <dd className={`shrink-0 text-lg ${total ? "font-black" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
