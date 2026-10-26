import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { ProductsTable } from "@/components/products-table";
export default function ProductsPage() {
  return (
    <main>
      <PageHeader title="Товары" />
      <div className="px-5 py-6 sm:px-8 lg:px-10">
        <Suspense fallback={<div className="min-h-64 rounded-md border border-line bg-surface" />}>
          <ProductsTable />
        </Suspense>
      </div>
    </main>
  );
}
