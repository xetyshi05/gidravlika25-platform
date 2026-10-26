import { PageHeading } from "@/components/page-heading";
import type { Metadata } from "next";
import { RequestsList } from "@/components/requests-list";
import { getRequestListFilters } from "@/lib/request-list-filters";
import { getRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Изготовление на заказ" };

export default async function CustomRequestsPage({ searchParams }: PageProps<"/requests/custom">) {
  const filters = getRequestListFilters(await searchParams);
  const result = await getRequests({
    type: "CUSTOM",
    ...filters,
    status: filters.status || undefined,
  });
  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <PageHeading
        eyebrow="CRM / Заявки"
        title="Изготовление на заказ"
        description="Обращения на производство гидроцилиндров по индивидуальным параметрам."
      />
      <RequestsList result={result} filters={filters} path="/requests/custom" />
    </main>
  );
}
