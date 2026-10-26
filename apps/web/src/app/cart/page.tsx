import { CartPage } from "@/components/cart/cart-page";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Корзина",
  description: "Оформление заявки на выбранные гидроцилиндры.",
  path: "/cart",
  index: false,
});

export default function CartRoute() {
  return <CartPage />;
}
