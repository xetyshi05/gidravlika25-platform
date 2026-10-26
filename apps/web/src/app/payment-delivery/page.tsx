import { PaymentDelivery } from "@/components/home/payment-delivery";
import { PageIntro } from "@/components/layout/page-intro";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Оплата и доставка",
  description:
    "Безналичная оплата, самовывоз гидроцилиндров со склада в Орле и доставка транспортными компаниями по всей России.",
  path: "/payment-delivery",
});

export default function PaymentDeliveryPage() {
  return (
    <>
      <PageIntro
        eyebrow="Оплата и доставка"
        title="Согласуем детали заказа, подтвердим наличие и подберём удобный способ получения"
        description="После оформления заказа менеджер свяжется с вами, уточнит состав поставки и согласует оплату, самовывоз или доставку."
        titleClassName="text-3xl"
        descriptionClassName="text-base"
      />
      <PaymentDelivery />
    </>
  );
}
