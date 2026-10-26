"use client";

import Link from "next/link";
import { IconShoppingCart } from "@tabler/icons-react";
import { useCart } from "@/components/cart/cart-provider";

export function CartLink() {
  const { itemsCount } = useCart();

  return (
    <Link
      href="/cart"
      aria-label={`Корзина, ${itemsCount} товаров`}
      className="relative grid h-10 w-10 place-items-center rounded-sm text-slate-700 transition-colors duration-200 ease-out hover:bg-red-50 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <IconShoppingCart className="h-5 w-5" aria-hidden="true" />
      <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
        {itemsCount}
      </span>
    </Link>
  );
}
