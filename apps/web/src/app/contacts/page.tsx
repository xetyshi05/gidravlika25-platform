import { Contacts } from "@/components/home/contacts";
import { PageIntro } from "@/components/layout/page-intro";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Контакты",
  description:
    "Контакты производства Гидравлика 25 в Орле и склада в Мытищах. Телефоны оптового и розничного отделов, адреса и режим работы.",
  path: "/contacts",
});

export default function ContactsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Контакты"
        title="Свяжитесь с нами"
        description="Поможем подобрать готовый гидроцилиндр или обсудить изготовление по вашим параметрам."
      />
      <Contacts />
    </>
  );
}
