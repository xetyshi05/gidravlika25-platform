"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { PhotoIcon } from "@/components/icons";
import { formatMoney } from "@/lib/request-format";
import type { CartRequestItem } from "@/types/requests";

type SortColumn = "productName" | "sku" | "price" | "quantity" | "total";

export function CartItemsTable({
  items,
  subtotal,
}: {
  items: CartRequestItem[];
  subtotal: string;
}) {
  const [sortBy, setSortBy] = useState<SortColumn>("productName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const value =
          sortBy === "productName"
            ? left.productName.localeCompare(right.productName, "ru")
            : sortBy === "sku"
              ? left.sku.localeCompare(right.sku, "ru", { numeric: true })
              : Number(left[sortBy]) - Number(right[sortBy]);
        return sortOrder === "asc" ? value : -value;
      }),
    [items, sortBy, sortOrder],
  );
  const toggleSort = (column: SortColumn) => {
    if (column === sortBy) setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  return (
    <table className="w-full table-fixed border-collapse text-left text-sm">
      <caption className="sr-only">Товары в заявке</caption>
      <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        <tr>
          <th scope="col" className="w-[5.5rem] px-3 py-4 sm:px-5">
            Фото
          </th>
          <SortHeader
            label="Товар"
            column="productName"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
          />
          <SortHeader
            label="Артикул"
            column="sku"
            className="w-[6rem]"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
          />
          <SortHeader
            label="Цена"
            column="price"
            className="w-[7.5rem]"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
          />
          <SortHeader
            label="Количество"
            column="quantity"
            className="w-[7rem]"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
          />
          <SortHeader
            label="Сумма"
            column="total"
            className="w-[8.5rem]"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
          />
        </tr>
      </thead>
      <tbody>
        {sortedItems.map((item) => (
          <tr key={item.id} className="border-t border-slate-200">
            <td className="px-3 py-3 sm:px-5">
              <ProductImage src={item.imagePath} alt={item.productName} />
            </td>
            <td className="max-w-0 px-3 py-4 sm:px-5">
              <div className="overflow-x-auto whitespace-nowrap pb-1 text-slate-950">
                {item.productName}
              </div>
            </td>
            <td className="break-all px-3 py-4 text-slate-700 sm:px-5">{item.sku}</td>
            <td className="px-3 py-4 text-slate-700 sm:px-5">{formatMoney(item.price)}</td>
            <td className="px-3 py-4 text-slate-700 sm:px-5">{item.quantity}</td>
            <td className="px-3 py-4 text-slate-700 sm:px-5">{formatMoney(item.total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200 bg-slate-50">
          <th
            colSpan={5}
            scope="row"
            className="px-3 py-4 text-right text-sm text-slate-950 sm:px-5"
          >
            Общая сумма
          </th>
          <td className="px-3 py-4 text-sm text-slate-950 sm:px-5">{formatMoney(subtotal)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function SortHeader({
  label,
  column,
  className = "",
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: SortColumn;
  className?: string;
  sortBy: SortColumn;
  sortOrder: "asc" | "desc";
  onSort: (column: SortColumn) => void;
}) {
  const active = sortBy === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
      className={`p-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Сортировать по столбцу «${label}». ${active ? `Сейчас: ${sortOrder === "asc" ? "по возрастанию" : "по убыванию"}` : "Сортировка не выбрана"}`}
        className="flex w-full items-center gap-2 px-3 py-4 text-left transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5"
      >
        {label}
        <span
          aria-hidden
          className={`text-sm leading-none ${active ? "text-brand" : "text-slate-300"}`}
        >
          {active && sortOrder === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = src && src !== failedSource ? src : null;

  if (source) {
    return (
      <div className="grid h-12 w-16 place-items-center overflow-hidden border border-slate-200 bg-white">
        <Image
          unoptimized
          src={source}
          alt={alt}
          width={64}
          height={48}
          className="size-full object-contain p-1"
          onError={() => setFailedSource(source)}
        />
      </div>
    );
  }

  return (
    <div
      className="grid h-12 w-16 place-items-center border border-slate-200 bg-slate-50 text-slate-400"
      role="img"
      aria-label={`Изображение товара «${alt}» отсутствует`}
    >
      <PhotoIcon className="size-5" stroke={1.5} aria-hidden="true" />
    </div>
  );
}
