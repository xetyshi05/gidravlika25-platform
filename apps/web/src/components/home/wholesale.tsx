import { CustomProductionRequestModal } from "@/components/home/custom-production-request-modal";

export function Wholesale() {
  return (
    <section id="wholesale" className="border-y border-slate-200 bg-slate-50 py-18 lg:py-24">
      <div className="mx-auto grid max-w-360 gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
            Для оптовых покупателей
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Условия для регулярных и объёмных заказов
          </h2>
          <div className="mt-5 flex flex-col gap-2 text-sm leading-6 text-slate-600 sm:flex-row sm:gap-6">
            <span>Работаем с организациями и ИП</span>
            <span className="hidden text-brand sm:block">•</span>
            <span>Подготовим индивидуальное предложение</span>
          </div>
        </div>
        <CustomProductionRequestModal
          buttonLabel="Заказать звонок"
          triggerClassName="border border-brand bg-white px-5 text-brand hover:bg-brand hover:text-white"
          eyebrow="Обратный звонок"
          title="Закажите звонок"
          description="Оставьте контактные данные — менеджер свяжется с вами и обсудит условия оптового заказа."
          requestKind="wholesale"
        />
      </div>
    </section>
  );
}
