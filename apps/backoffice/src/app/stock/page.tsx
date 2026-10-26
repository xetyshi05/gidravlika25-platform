import { PageHeader } from "@/components/ui";
import { StockTable } from "@/components/stock-table";
export default function StockPage() {
  return (
    <main>
      <PageHeader title="Остатки" />
      <div className="space-y-5 px-5 py-6 sm:px-8 lg:px-10">
        <StockTable />
      </div>
    </main>
  );
}
