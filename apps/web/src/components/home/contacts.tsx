import Image from "next/image";
import { IconExternalLink } from "@tabler/icons-react";
import { VACANCIES_URL, VK_LOGO_PATH, VK_URL } from "@/components/brand/partner-marks";
import { YandexMap } from "@/components/ui/yandex-map";
import { productionMapLocation } from "@/data/company-location";

const contactGroups = [
  {
    title: "Адреса",
    items: [
      {
        label: "Производство",
        value: "302008, Орловская область, г. Орёл, ул. Машиностроительная, зд. 8/1",
      },
      {
        label: "Склад и магазин",
        value: "141006, Московская область, г. Мытищи, Олимпийский проспект, 40, к. 3",
      },
    ],
  },
  {
    title: "Режим работы",
    items: [
      { label: "Понедельник–пятница", value: "08:00–17:00" },
      { label: "Суббота–воскресенье", value: "Выходной" },
    ],
  },
] as const;

const companyDetails = [
  "ООО «ГИДРАВЛИКА 25»",
  "ОГРН 1255700000115",
  "ИНН/КПП 5700012184 / 570001001",
  "ОКПО 99368461",
  "302008, Орловская область, г. Орёл, ул. Машиностроительная, зд. 8",
  "Банк: ПАО СБЕРБАНК, БИК 045402601",
  "р/с 40702810047710000042",
  "к/с 30101810300000000601",
] as const;

export function Contacts() {
  return (
    <>
      <section id="contacts" className="bg-white py-18 lg:py-24">
        <div className="mx-auto grid max-w-360 gap-12 px-4 sm:px-6 lg:grid-cols-[.95fr_1.05fr] lg:gap-16 lg:px-8">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Производство, склад и отделы продаж
            </h2>
            <div className="mt-9 grid gap-8">
              {contactGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-lg font-black text-slate-950">{group.title}</h3>
                  <dl className="mt-4 grid gap-4">
                    {group.items.map((item) => (
                      <div key={item.label}>
                        <dt className="text-sm text-slate-500">{item.label}</dt>
                        <dd className="mt-1 text-base leading-7 text-slate-800">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <div className="mt-9 grid gap-5 sm:grid-cols-2">
              <a
                href="tel:+79299185147"
                className="group border-l-2 border-brand pl-4 transition-colors duration-200 ease-out hover:border-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                <span className="block text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
                  Оптовый отдел
                </span>
                <span className="mt-2 block text-lg font-black text-slate-950 transition-colors duration-200 ease-out group-hover:text-brand">
                  +7 (929) 918-51-47
                </span>
              </a>
              <a
                href="tel:+79253858421"
                className="group border-l-2 border-brand pl-4 transition-colors duration-200 ease-out hover:border-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                <span className="block text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
                  Розничный отдел
                </span>
                <span className="mt-2 block text-lg font-black text-slate-950 transition-colors duration-200 ease-out group-hover:text-brand">
                  +7 (925) 385-84-21
                </span>
              </a>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <a
                href="mailto:info@gidravlika25.ru"
                className="group border-l-2 border-brand pl-4 transition-colors duration-200 ease-out hover:border-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                <span className="block text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
                  Email
                </span>
                <span className="mt-2 block text-lg font-black text-slate-950 transition-colors duration-200 ease-out group-hover:text-brand">
                  info@gidravlika25.ru
                </span>
              </a>
              <a
                href={VK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Гидравлика 25 во ВКонтакте — открыть в новой вкладке"
                className="group flex min-h-13 items-center border-l-2 border-brand pl-4 transition-colors duration-200 ease-out hover:border-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                <Image
                  src={VK_LOGO_PATH}
                  alt="ВКонтакте"
                  width={575}
                  height={100}
                  unoptimized
                  className="h-9 w-auto"
                />
              </a>
            </div>
            <a
              href={VACANCIES_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Вакансии Гидравлика 25 на hh.ru — открыть в новой вкладке"
              className="group mt-7 block min-h-13 border-l-2 border-brand pl-4 transition-colors duration-200 ease-out hover:border-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              <span className="block text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
                Работа у нас
              </span>
              <span className="mt-2 flex items-center gap-2 text-lg font-black text-slate-950 transition-colors duration-200 ease-out group-hover:text-brand">
                Вакансии
                <IconExternalLink className="size-5" aria-hidden="true" />
              </span>
            </a>
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

      <section className="border-t border-slate-200 bg-white py-18 lg:py-24">
        <div className="mx-auto grid max-w-360 gap-8 px-4 sm:px-6 lg:grid-cols-[.4fr_.6fr] lg:gap-16 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
              Юридическая информация
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Реквизиты компании
            </h2>
          </div>
          <ul className="grid gap-x-10 gap-y-4 border-l-2 border-slate-200 pl-5 text-base leading-7 text-slate-700 sm:grid-cols-2">
            {companyDetails.map((detail, index) => (
              <li key={detail} className={index === 0 || index >= 4 ? "sm:col-span-2" : undefined}>
                {detail}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
