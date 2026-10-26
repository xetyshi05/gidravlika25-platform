export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Загрузка раздела Back Office" className="animate-pulse">
      <span className="sr-only" role="status">
        Загрузка раздела Back Office
      </span>
      <header className="border-b border-line px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="h-3 w-28 rounded-sm bg-brand-soft" />
        <div className="mt-4 h-10 w-full max-w-md rounded-sm bg-surface-raised" />
        <div className="mt-4 h-5 w-full max-w-2xl rounded-sm bg-surface-raised" />
      </header>
      <div className="space-y-5 px-5 py-6 sm:px-8 lg:px-10">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-28 rounded-md border border-line bg-surface" />
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <div className="h-16 border-b border-line bg-field" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-14 border-b border-line last:border-b-0" />
          ))}
        </div>
      </div>
    </main>
  );
}
