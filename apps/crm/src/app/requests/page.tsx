import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { RequestsList } from "@/components/requests-list";
import { getRequestListFilters } from "@/lib/request-list-filters";
import { getRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Все заявки" };

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const filters = getRequestListFilters(await searchParams);
  const result = await getRequests({ ...filters, status: filters.status || undefined });
  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <PageHeading
        eyebrow="CRM / Заявки"
        title="Все заявки"
        description="Все обращения клиентов: из корзины, на изготовление и оптовые закупки."
      />
      <RequestsList result={result} filters={filters} path="/requests" showDirection />
    </main>
  );
}
