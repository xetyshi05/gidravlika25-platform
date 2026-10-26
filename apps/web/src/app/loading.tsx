import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function Loading() {
  return (
    <div className="grid min-h-64 place-items-center px-4" aria-label="Загрузка страницы">
      <LoadingSpinner label="Загрузка страницы" className="min-h-12 min-w-12" />
    </div>
  );
}
