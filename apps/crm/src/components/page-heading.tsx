export function PageHeading({
  eyebrow = "CRM",
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
          {description}
        </p>
      ) : null}
    </div>
  );
}
