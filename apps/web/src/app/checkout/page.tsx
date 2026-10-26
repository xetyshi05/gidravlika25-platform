import { CheckoutPage } from "@/components/cart/checkout-page";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Оформление заявки",
  description: "Оформление заявки на выбранные гидроцилиндры.",
  path: "/checkout",
  index: false,
});

export default function CheckoutRoute() {
  return <CheckoutPage />;
}
