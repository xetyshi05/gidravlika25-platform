"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogProduct } from "@/lib/catalog-api";
import { timedFetch } from "@/lib/api-client";
import { browserApi } from "@/lib/browser-api";

const storageKey = "gidravlika25-cart";

export type CartItem = Pick<
  CatalogProduct,
  | "id"
  | "slug"
  | "name"
  | "sku"
  | "imagePath"
  | "price"
  | "pistonDiameterMm"
  | "rodDiameterMm"
  | "strokeMm"
> & {
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemsCount: number;
  total: number;
  isHydrated: boolean;
  addProduct: (product: CatalogProduct) => void;
  removeProduct: (slug: string) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    (typeof item.price === "string" || item.price === null) &&
    typeof item.quantity === "number"
  );
}

function getCartItem(product: CatalogProduct): CartItem {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    imagePath: product.imagePath,
    price: product.price,
    pistonDiameterMm: product.pistonDiameterMm,
    rodDiameterMm: product.rodDiameterMm,
    strokeMm: product.strokeMm,
    quantity: 1,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let animationFrame: number | undefined;

    const hydrate = async () => {
      let savedItems: CartItem[] = [];

      try {
        const savedCart = window.localStorage.getItem(storageKey);
        const parsedCart: unknown = savedCart ? JSON.parse(savedCart) : [];

        if (Array.isArray(parsedCart) && parsedCart.every(isCartItem)) {
          savedItems = parsedCart.filter((item) => item.quantity > 0);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }

      // Stored cart data can outlive a catalog setting change. Fail closed so a
      // previously saved price is never revealed while public prices are hidden.
      let showPrices = false;
      try {
        const { data: settings } = await browserApi.GET("/catalog/settings", {
          signal: controller.signal,
          fetch: timedFetch(5_000),
        });
        showPrices = settings?.showPrices === true;
      } catch {
        // The cart remains usable with request-only prices while settings are unavailable.
      }
      if (controller.signal.aborted) return;
      if (!showPrices) savedItems = savedItems.map((item) => ({ ...item, price: null }));

      animationFrame = window.requestAnimationFrame(() => {
        setItems(savedItems);
        setIsHydrated(true);
      });
    };

    void hydrate();

    return () => {
      controller.abort();
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    if (isHydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    }
  }, [isHydrated, items]);

  const value = useMemo<CartContextValue>(() => {
    const addProduct = (product: CatalogProduct) => {
      setItems((currentItems) => {
        const existingItem = currentItems.find((item) => item.slug === product.slug);

        if (existingItem) {
          return currentItems.map((item) =>
            item.slug === product.slug
              ? { ...item, price: product.price, quantity: item.quantity + 1 }
              : item,
          );
        }

        return [...currentItems, getCartItem(product)];
      });
    };

    const removeProduct = (slug: string) => {
      setItems((currentItems) => currentItems.filter((item) => item.slug !== slug));
    };

    const updateQuantity = (slug: string, quantity: number) => {
      if (quantity <= 0) {
        removeProduct(slug);
        return;
      }

      setItems((currentItems) =>
        currentItems.map((item) => (item.slug === slug ? { ...item, quantity } : item)),
      );
    };

    const clearCart = () => {
      setItems([]);
    };

    return {
      items,
      itemsCount: items.reduce((count, item) => count + item.quantity, 0),
      total: items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
      isHydrated,
      addProduct,
      removeProduct,
      updateQuantity,
      clearCart,
    };
  }, [isHydrated, items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider.");
  }

  return context;
}
