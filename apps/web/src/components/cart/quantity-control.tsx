"use client";

import { IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { QuantityInput } from "@/components/cart/quantity-input";

type QuantityControlProps = {
  productName: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onQuantityChange: (quantity: number) => void;
  className?: string;
};

export function QuantityControl({
  productName,
  quantity,
  onDecrease,
  onIncrease,
  onQuantityChange,
  className = "",
}: QuantityControlProps) {
  return (
    <div
      className={`quantity-control ${className}`}
      role="group"
      aria-label={`Количество товара ${productName}`}
    >
      <button
        type="button"
        onClick={onDecrease}
        aria-label={
          quantity === 1
            ? `Удалить ${productName} из корзины`
            : `Уменьшить количество ${productName}`
        }
        className="quantity-control-action grid cursor-pointer place-items-center text-white transition-colors duration-200 ease-out focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-brand"
      >
        {quantity === 1 ? (
          <IconTrash className="h-4 w-4" aria-hidden="true" />
        ) : (
          <IconMinus className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <label
        className="quantity-control-value flex items-center justify-center gap-1 px-3 text-sm font-black"
        aria-label={`Количество товара ${productName}`}
      >
        <QuantityInput
          quantity={quantity}
          onChange={onQuantityChange}
          className="rounded-none bg-transparent text-center outline-none"
        />
        <span>шт.</span>
      </label>
      <button
        type="button"
        onClick={onIncrease}
        aria-label={`Увеличить количество ${productName}`}
        className="quantity-control-action grid cursor-pointer place-items-center text-white transition-colors duration-200 ease-out focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <IconPlus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
