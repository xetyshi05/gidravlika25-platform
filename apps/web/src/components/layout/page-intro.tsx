type PageIntroProps = {
  eyebrow: string;
  title: string;
  description?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  titleClassName,
  descriptionClassName,
}: PageIntroProps) {
  return (
    <section className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-360 px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
        <h1
          className={`mt-4 max-w-4xl font-black tracking-tight text-slate-950 ${titleClassName ?? "text-4xl sm:text-5xl"}`}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={`mt-5 max-w-2xl text-base leading-7 text-slate-600 ${descriptionClassName ?? "sm:text-lg"}`}
          >
            {description}
          </p>
        ) : null}
      </div>
    </section>
  );
}
