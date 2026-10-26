import { IconCheck } from "@tabler/icons-react";
import { YandexMap } from "@/components/ui/yandex-map";
import { productionMapLocation } from "@/data/company-location";

const pickupDetails = [
  "302008, г. Орёл, ул. Машиностроительная, зд. 8",
  "Понедельник–пятница, 08:00–17:00",
  "+7 (929) 918-51-47",
];

export function PaymentDelivery() {
  return (
    <>
      <section className="bg-white py-18 lg:py-24">
        <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Оплата</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Безналичный расчёт
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Оплата производится безналичным переводом на расчётный счёт компании после согласования
            заказа с менеджером.
          </p>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-18 lg:py-24">
        <div className="mx-auto grid max-w-360 gap-10 px-4 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-stretch lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Самовывоз</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Со склада в Орле
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Получите заказ самостоятельно после подтверждения менеджером.
            </p>
            <address className="mt-7 grid gap-3 not-italic text-sm leading-6 text-slate-700">
              {pickupDetails.map((detail) => (
                <p key={detail} className="flex gap-3">
                  <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white">
                    <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {detail}
                </p>
              ))}
            </address>
          </div>
          <YandexMap
            coordinates={productionMapLocation.markerCoordinates}
            center={productionMapLocation.initialCenter}
            zoom={productionMapLocation.zoom}
            label="Производство в Орле"
            className="min-h-96"
          />
        </div>
      </section>

      <section id="delivery" className="bg-white py-18 lg:py-24">
        <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Доставка</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Отправим в любой регион России
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
            Доставку организуем транспортной компанией «Деловые Линии» или другой ТК по
            согласованию. Стоимость доставки покупатель оплачивает напрямую транспортной компании.
          </p>
        </div>
      </section>
    </>
  );
}
