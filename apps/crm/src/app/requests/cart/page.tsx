import { PageHeading } from "@/components/page-heading";
import type { Metadata } from "next";
import { RequestsList } from "@/components/requests-list";
import { getRequestListFilters } from "@/lib/request-list-filters";
import { getRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Заявки из корзины" };

export default async function CartRequestsPage({ searchParams }: PageProps<"/requests/cart">) {
  const filters = getRequestListFilters(await searchParams);
  const result = await getRequests({
    type: "CART",
    ...filters,
    status: filters.status || undefined,
  });
  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <PageHeading
        eyebrow="CRM / Заявки"
        title="Из корзины"
        description="Заказы, оформленные через корзину основного сайта."
      />
      <RequestsList result={result} filters={filters} path="/requests/cart" />
    </main>
  );
}
