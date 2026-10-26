import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { CustomersTable } from "@/components/customers-table";
import { getCustomerListFilters, getCustomers } from "@/lib/customers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Клиенты" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const filters = getCustomerListFilters(await searchParams);
  const result = await getCustomers(filters);
  return (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <PageHeading
        eyebrow="CRM / Клиенты"
        title="Клиенты"
        description="Контакты и история обращений клиентов компании."
      />
      <section className="mt-8">
        <CustomersTable result={result} filters={filters} />
      </section>
    </main>
  );
}
