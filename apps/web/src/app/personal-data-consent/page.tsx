import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/layout/page-intro";
import {
  PERSONAL_DATA_DOCUMENT_EFFECTIVE_DATE,
  PERSONAL_DATA_DOCUMENT_VERSION,
} from "@/lib/personal-data";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Согласие на обработку персональных данных",
  description: "Согласие на обработку персональных данных при отправке заявки.",
  path: "/personal-data-consent",
  index: false,
});

const listClassName = "ml-5 list-disc space-y-2 marker:text-brand";

function ConsentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

export default function PersonalDataConsentPage() {
  return (
    <>
      <PageIntro
        eyebrow="Документы"
        title="Согласие на обработку персональных данных"
        description={`Редакция ${PERSONAL_DATA_DOCUMENT_VERSION} от ${PERSONAL_DATA_DOCUMENT_EFFECTIVE_DATE}`}
      />
      <article className="mx-auto max-w-4xl space-y-12 px-4 py-16 text-base leading-7 text-slate-700 sm:px-6 lg:px-8">
        <p className="text-lg leading-8 text-slate-800">
          Устанавливая отдельный флажок согласия и отправляя форму на сайте gidravlika25.ru,
          пользователь свободно, своей волей и в своём интересе даёт ООО «ГИДРАВЛИКА 25» согласие на
          обработку персональных данных на следующих условиях.
        </p>

        <ConsentSection title="1. Оператор">
          <p>
            ООО «ГИДРАВЛИКА 25», ОГРН 1255700000115, ИНН 5700012184, адрес: 302008, Орловская
            область, г. Орёл, ул. Машиностроительная, зд. 8, электронная почта:{" "}
            <a
              className="font-bold text-brand underline-offset-4 hover:underline"
              href="mailto:info@gidravlika25.ru"
            >
              info@gidravlika25.ru
            </a>
            .
          </p>
        </ConsentSection>

        <ConsentSection title="2. Персональные данные">
          <p>Согласие распространяется на данные, которые пользователь указывает в форме:</p>
          <ul className={listClassName}>
            <li>фамилия, имя и отчество;</li>
            <li>номер телефона и адрес электронной почты;</li>
            <li>наименование компании;</li>
            <li>адрес и дополнительные сведения для доставки;</li>
            <li>состав заказа, выбранные способы доставки и оплаты;</li>
            <li>комментарий и другие сведения, добровольно указанные пользователем.</li>
          </ul>
          <p>
            Согласие не распространяется на специальные категории и биометрические персональные
            данные. Пользователь не должен указывать такие данные в свободных полях формы.
          </p>
        </ConsentSection>

        <ConsentSection title="3. Цели обработки">
          <ul className={listClassName}>
            <li>принять, зарегистрировать и обработать заявку;</li>
            <li>связаться с пользователем и уточнить сведения;</li>
            <li>подготовить предложение, заключить и исполнить договор;</li>
            <li>организовать оплату, самовывоз или доставку;</li>
            <li>вести историю обращения и контролировать качество работы с заявкой.</li>
          </ul>
          <p>Настоящее согласие не разрешает рекламные рассылки.</p>
        </ConsentSection>

        <ConsentSection title="4. Действия с данными">
          <p>
            Оператор вправе осуществлять сбор, запись, систематизацию, накопление, хранение,
            уточнение, извлечение, использование, передачу уполномоченным обработчикам,
            блокирование, удаление, обезличивание и уничтожение данных с использованием средств
            автоматизации или без них, включая передачу по информационно-телекоммуникационным сетям.
          </p>
          <p>
            Данные могут быть предоставлены работникам Оператора, поставщикам информационной
            инфраструктуры, связи и доставки только в объёме, необходимом для обработки и исполнения
            заявки, при наличии соответствующего правового основания и обязанности соблюдать
            конфиденциальность.
          </p>
          <p>
            Согласие не разрешает публикацию или распространение данных неопределённому кругу лиц.
          </p>
        </ConsentSection>

        <ConsentSection title="5. Срок действия и отзыв">
          <p>
            Согласие действует до достижения целей обработки или до его отзыва, если более
            длительный срок не установлен законом или договором. Отозвать согласие или потребовать
            прекращения обработки можно письмом на{" "}
            <a
              className="font-bold text-brand underline-offset-4 hover:underline"
              href="mailto:info@gidravlika25.ru"
            >
              info@gidravlika25.ru
            </a>
            . В обращении следует указать сведения, позволяющие идентифицировать заявку и её
            заявителя.
          </p>
          <p>
            После отзыва Оператор прекращает обработку и удаляет данные в сроки, предусмотренные
            законом, если их дальнейшая обработка не требуется для исполнения договора, выполнения
            установленной законом обязанности или защиты законных интересов Оператора.
          </p>
        </ConsentSection>

        <ConsentSection title="6. Подтверждение согласия">
          <p>
            Факт согласия подтверждается совокупностью действий пользователя: самостоятельным
            заполнением формы, установкой отдельного флажка и отправкой формы. Оператор сохраняет
            дату принятия согласия и версию документа {PERSONAL_DATA_DOCUMENT_VERSION} вместе с
            заявкой.
          </p>
          <p>
            До отправки формы пользователь может ознакомиться с{" "}
            <Link
              className="font-bold text-brand underline-offset-4 hover:underline"
              href="/privacy"
            >
              Политикой обработки персональных данных
            </Link>
            .
          </p>
        </ConsentSection>
      </article>
    </>
  );
}
