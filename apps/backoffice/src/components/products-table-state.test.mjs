import assert from "node:assert/strict";
import test from "node:test";
import { filtersForAttention, productsEmptyState } from "./products-table-state.ts";

test("dashboard attention links map to the expected product filters", () => {
  assert.deepEqual(filtersForAttention("without-image"), [
    { id: "image", mode: "anyOf", values: ["none"] },
  ]);
  assert.deepEqual(filtersForAttention("without-price"), [
    { id: "price", mode: "equals", value: "0" },
  ]);
  assert.deepEqual(filtersForAttention("out-of-stock"), [
    { id: "stock", mode: "anyOf", values: ["none"] },
  ]);
  assert.deepEqual(filtersForAttention("inactive"), [
    { id: "active", mode: "anyOf", values: ["false"] },
  ]);
  assert.equal(filtersForAttention(null), null);
  assert.equal(filtersForAttention("unknown"), null);
});

test("an empty filtered result is not presented as an empty catalog", () => {
  assert.deepEqual(productsEmptyState(1), {
    title: "Товары не найдены",
    description: "По заданным фильтрам нет результатов.",
    canResetFilters: true,
  });
});

test("an unfiltered empty result keeps the new-catalog call to action", () => {
  assert.deepEqual(productsEmptyState(0), {
    title: "Товары пока не добавлены",
    description: "Добавьте первый товар кнопкой в панели таблицы.",
    canResetFilters: false,
  });
});
