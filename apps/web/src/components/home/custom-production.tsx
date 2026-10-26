import { CustomProductionRequestModal } from "@/components/home/custom-production-request-modal";

export function CustomProduction() {
  return (
    <section id="custom-production" className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
            Изготовление под заказ
          </p>
          <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Не нашли подходящий гидроцилиндр? Изготовим по вашим параметрам.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Передайте известные размеры или чертёж — менеджер уточнит условия и подготовит
            предложение.
          </p>
          <CustomProductionRequestModal />
        </div>
      </div>
    </section>
  );
}
