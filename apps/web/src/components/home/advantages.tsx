import { SectionHeading } from "@/components/home/section-heading";

const advantages = [
  { number: "01", title: "Собственное производство", text: "Контролируем параметры изделий." },
  {
    number: "02",
    title: "Готовые позиции на складе",
    text: "Популярные модели для оперативной поставки.",
  },
  {
    number: "03",
    title: "Изготовление по параметрам",
    text: "Подбираем решение под вашу технику.",
  },
  { number: "04", title: "Доставка по России", text: "Организуем отгрузку в нужный регион." },
];

export function Advantages() {
  return (
    <section className="mx-auto max-w-360 px-4 py-18 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading eyebrow="Почему мы" title="Работаем с задачей, а не только с артикулом" />
      <div className="mt-8 grid divide-y divide-slate-200 border-y border-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
        {advantages.map((advantage) => (
          <article key={advantage.number} className="p-6 first:pl-0 md:py-7 md:even:pl-7">
            <span className="text-xs font-bold tracking-[0.16em] text-brand">
              {advantage.number}
            </span>
            <h3 className="mt-5 text-xl font-black tracking-tight text-slate-950">
              {advantage.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{advantage.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
