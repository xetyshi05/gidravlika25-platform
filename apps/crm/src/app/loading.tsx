export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Загрузка раздела CRM"
      className="mx-auto max-w-360 animate-pulse px-4 py-10 sm:px-6 lg:px-8 lg:py-12"
    >
      <span className="sr-only" role="status">
        Загрузка раздела CRM
      </span>
      <div className="h-3 w-32 bg-red-100" />
      <div className="mt-4 h-10 w-full max-w-md bg-slate-200" />
      <div className="mt-4 h-5 w-full max-w-2xl bg-slate-200" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-8 overflow-hidden border border-slate-200 bg-white">
        <div className="h-18 border-b border-slate-200 bg-slate-50" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-16 border-b border-slate-100 last:border-b-0" />
        ))}
      </div>
    </main>
  );
}
