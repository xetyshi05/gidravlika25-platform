export default function CatalogLoading() {
  return (
    <div
      className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-16"
      aria-label="Загрузка каталога"
    >
      <div className="h-4 w-28 animate-pulse bg-slate-200" />
      <div className="mt-5 h-12 max-w-xl animate-pulse bg-slate-200" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-105 animate-pulse border border-slate-200 bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
