import assert from "node:assert/strict";
import { test } from "node:test";
import { customOrderComment } from "./custom-order-prefill.ts";

const range = (label, unit, min, max, boundsMin = 0, boundsMax = 1000) => ({
  label,
  unit,
  min,
  max,
  boundsMin,
  boundsMax,
});

test("describes only the filters the visitor narrowed", () => {
  assert.equal(
    customOrderComment({
      search: "  КУН  ",
      categories: ["Гидроцилиндры"],
      ranges: [
        range("Диаметр поршня", "мм", 80, 80),
        range("Рабочий ход", "мм", 300, 1000),
        range("Размер в сложенном состоянии", "мм", 0, 500),
        range("Максимальное давление", "МПа", 16.5, 25),
        range("Номинальное давление", "МПа", 0, 1000),
      ],
    }),
    "В каталоге не нашлось подходящего гидроцилиндра. Нужно: категория — Гидроцилиндры; " +
      "диаметр поршня — 80 мм; рабочий ход — от 300 мм; размер в сложенном состоянии — до 500 мм; " +
      "максимальное давление — от 16,5 до 25 МПа; поиск — «КУН».",
  );
});

test("treats an exact value equal to a catalog bound as requested", () => {
  assert.equal(
    customOrderComment({ categories: [], ranges: [range("Диаметр штока", "мм", 0, 0)] }),
    "В каталоге не нашлось подходящего гидроцилиндра. Нужно: диаметр штока — 0 мм.",
  );
});

test("returns an empty comment without filters", () => {
  assert.equal(
    customOrderComment({ search: " ", categories: [], ranges: [range("Ход", "мм", 0, 1000)] }),
    "",
  );
});
