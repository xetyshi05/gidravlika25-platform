"use client";

import { useCart } from "@/components/cart/cart-provider";
import { QuantityControl } from "@/components/cart/quantity-control";
import type { CatalogProduct } from "@/lib/catalog-api";

type AddToCartButtonProps = {
  product: CatalogProduct;
  className?: string;
  fullWidth?: boolean;
  compact?: boolean;
};

export function AddToCartButton({
  product,
  className = "",
  fullWidth = false,
  compact = false,
}: AddToCartButtonProps) {
  const { addProduct, items, updateQuantity } = useCart();
  const cartItem = items.find((item) => item.slug === product.slug);

  if (cartItem) {
    return (
      <QuantityControl
        productName={product.name}
        quantity={cartItem.quantity}
        onDecrease={() => updateQuantity(product.slug, cartItem.quantity - 1)}
        onIncrease={() => updateQuantity(product.slug, cartItem.quantity + 1)}
        onQuantityChange={(quantity) => updateQuantity(product.slug, quantity)}
        className={`${compact ? "quantity-control--compact" : ""} ${fullWidth ? "quantity-control--full-width" : ""} self-center ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => addProduct(product)}
      className={`inline-flex ${compact ? "min-h-9" : "min-h-11"} cursor-pointer items-center justify-center border border-brand bg-brand px-5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${fullWidth ? "w-full" : ""} ${className}`}
    >
      Добавить в корзину
    </button>
  );
}
