type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  variant?: "default" | "inverse";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  variant = "default",
}: SectionHeadingProps) {
  const isInverse = variant === "inverse";

  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
      <h2
        className={`mt-3 text-3xl font-black tracking-tight sm:text-4xl ${isInverse ? "text-white" : "text-slate-950"}`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-4 text-base leading-7 ${isInverse ? "text-slate-300" : "text-slate-600"}`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
