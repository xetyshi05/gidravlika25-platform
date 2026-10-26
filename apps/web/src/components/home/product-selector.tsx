"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldMessage } from "@/components/forms/field-message";

type SelectorField = {
  id: "pistonDiameter" | "rodDiameter" | "stroke";
  label: string;
  placeholder: string;
  minParam: string;
  maxParam: string;
};

const fields: SelectorField[] = [
  {
    id: "pistonDiameter",
    label: "Диаметр поршня, мм",
    placeholder: "Например, 63",
    minParam: "minPistonDiameter",
    maxParam: "maxPistonDiameter",
  },
  {
    id: "rodDiameter",
    label: "Диаметр штока, мм",
    placeholder: "Например, 35",
    minParam: "minRodDiameter",
    maxParam: "maxRodDiameter",
  },
  {
    id: "stroke",
    label: "Рабочий ход штока, мм",
    placeholder: "Например, 250",
    minParam: "minStroke",
    maxParam: "maxStroke",
  },
];

type SelectorValues = Record<SelectorField["id"], string>;

const initialValues: SelectorValues = {
  pistonDiameter: "",
  rodDiameter: "",
  stroke: "",
};

export function ProductSelector() {
  const router = useRouter();
  const [values, setValues] = useState<SelectorValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<SelectorField["id"], string>>>({});

  function submitSelector(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const params = new URLSearchParams();
    const nextErrors: Partial<Record<SelectorField["id"], string>> = {};

    for (const field of fields) {
      const value = values[field.id].trim();
      if (value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) {
          nextErrors[field.id] = "Введите число не меньше нуля";
          continue;
        }
        params.set(field.minParam, value);
        params.set(field.maxParam, value);
      }
    }

    setErrors(nextErrors);
    const firstInvalidField = Object.keys(nextErrors)[0];
    if (firstInvalidField) {
      const invalidControl = form.elements.namedItem(firstInvalidField);
      if (invalidControl instanceof HTMLElement) invalidControl.focus();
      return;
    }

    router.push(`/catalog${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  return (
    <section id="selector" className="border-y border-slate-200 bg-slate-50 py-14 lg:py-18">
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
              Быстрый подбор
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Подберите гидроцилиндр по параметрам
            </h2>
          </div>
          <p className="max-w-md text-sm leading-5 text-slate-500">
            Укажите известные характеристики — покажем подходящие товары в каталоге.
          </p>
        </div>
        <form
          className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
          noValidate
          onSubmit={submitSelector}
        >
          {fields.map((field) => (
            <label
              key={field.id}
              htmlFor={field.id}
              className="grid gap-1.5 text-xs font-bold text-slate-700"
            >
              {field.label}
              <input
                id={field.id}
                value={values[field.id]}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [field.id]: event.target.value }));
                  setErrors((current) => {
                    if (!current[field.id]) return current;
                    const next = { ...current };
                    delete next[field.id];
                    return next;
                  });
                }}
                type="number"
                inputMode="numeric"
                min="0"
                placeholder={field.placeholder}
                aria-invalid={Boolean(errors[field.id])}
                aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                className="h-12 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none placeholder:font-normal placeholder:text-slate-400 transition-colors focus:border-brand"
              />
              <FieldMessage id={`${field.id}-error`} message={errors[field.id]} />
            </label>
          ))}
          <button
            type="submit"
            className="h-12 cursor-pointer bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:mt-[1.375rem]"
          >
            Подобрать
          </button>
        </form>
      </div>
    </section>
  );
}
