"use client";

import { IconAdjustmentsHorizontal, IconCheck, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomSelect } from "@/components/ui";

export type TableFilter = {
  id: string;
  mode: string;
  value?: string;
  values?: string[];
  min?: string;
  max?: string;
};

type Option = { value: string; label: string };
type AdvancedFilterProps = {
  id: string;
  ariaLabel: string;
  filter?: TableFilter;
  kind: "text" | "number" | "select";
  options?: Option[];
  onChange: (filter?: TableFilter) => void;
};

const textModes = [
  { value: "contains", label: "Содержит" },
  { value: "equals", label: "Равно" },
  { value: "startsWith", label: "Начинается с" },
  { value: "notContains", label: "Не содержит" },
];
const numberModes = [
  { value: "equals", label: "Равно" },
  { value: "gt", label: "Больше" },
  { value: "gte", label: "Не меньше" },
  { value: "lt", label: "Меньше" },
  { value: "lte", label: "Не больше" },
  { value: "between", label: "Диапазон" },
];
const selectModes = [
  { value: "anyOf", label: "Любое из" },
  { value: "noneOf", label: "Ни одно из" },
];

export function AdvancedFilter({
  id,
  ariaLabel,
  filter,
  kind,
  options = [],
  onChange,
}: AdvancedFilterProps) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const defaultMode = kind === "text" ? "contains" : kind === "number" ? "equals" : "anyOf";
  const [draft, setDraft] = useState<TableFilter>({
    id,
    mode: filter?.mode ?? defaultMode,
    value: filter?.value ?? "",
    values: filter?.values ?? [],
    min: filter?.min ?? "",
    max: filter?.max ?? "",
  });

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => setPresent(open), open ? 0 : 150);
    return () => window.clearTimeout(timeout);
  }, [open]);

  const active = useMemo(
    () =>
      kind === "select"
        ? Boolean(filter?.values?.length)
        : kind === "number"
          ? Boolean(filter?.value || filter?.min || filter?.max)
          : Boolean(filter?.value),
    [filter, kind],
  );
  const label =
    kind === "select" && filter?.values?.length
      ? `${filter.values.length} выбр.`
      : active
        ? "Фильтр"
        : "Все";
  const apply = () => {
    const hasValue =
      kind === "select"
        ? Boolean(draft.values?.length)
        : kind === "number"
          ? Boolean(draft.value || draft.min || draft.max)
          : Boolean(draft.value);
    onChange(hasValue ? { ...draft, id } : undefined);
    setOpen(false);
  };
  const modeOptions = kind === "text" ? textModes : kind === "number" ? numberModes : selectModes;

  return (
    <div ref={ref} className="relative min-w-28">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => {
          if (!open)
            setDraft({
              id,
              mode: filter?.mode ?? defaultMode,
              value: filter?.value ?? "",
              values: filter?.values ?? [],
              min: filter?.min ?? "",
              max: filter?.max ?? "",
            });
          setOpen((value) => !value);
        }}
        className={`flex h-8 w-full items-center justify-between rounded border bg-canvas px-2 text-left text-xs font-normal ${active ? "border-brand text-copy" : "border-line text-copy-muted"}`}
      >
        <span className="truncate">{label}</span>
        <IconAdjustmentsHorizontal className="size-3.5 shrink-0" />
      </button>
      {present && (
        <div
          className={
            "bo-filter-menu absolute left-0 top-9 z-50 w-64 rounded-md border border-line bg-surface p-3 shadow-xl " +
            (open ? "bo-filter-menu-enter" : "bo-filter-menu-leave")
          }
        >
          <label className="mb-2 block text-[11px] text-copy-faint">
            Режим сравнения
            <div className="mt-1">
              <CustomSelect
                ariaLabel={"Режим сравнения: " + ariaLabel}
                value={draft.mode}
                onChange={(value) => setDraft((current) => ({ ...current, mode: value }))}
                options={modeOptions}
                size="compact"
              />
            </div>
          </label>
          {kind === "select" ? (
            <div className="max-h-44 space-y-1 overflow-auto py-1">
              {options.map((option) => {
                const checked = draft.values?.includes(option.value) ?? false;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        values: checked
                          ? current.values?.filter((value) => value !== option.value)
                          : [...(current.values ?? []), option.value],
                      }))
                    }
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs hover:bg-surface-raised"
                  >
                    <span
                      className={`grid size-4 place-items-center rounded border ${checked ? "border-brand bg-brand text-white" : "border-line"}`}
                    >
                      {checked && <IconCheck className="size-3 stroke-[3]" />}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : kind === "number" && draft.mode === "between" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label={`${ariaLabel}: от`}
                value={draft.min}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, min: event.target.value }))
                }
                type="number"
                placeholder="От"
                className="h-8 min-w-0 rounded border border-line bg-field px-2 text-xs"
              />
              <input
                aria-label={`${ariaLabel}: до`}
                value={draft.max}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, max: event.target.value }))
                }
                type="number"
                placeholder="До"
                className="h-8 min-w-0 rounded border border-line bg-field px-2 text-xs"
              />
            </div>
          ) : (
            <input
              aria-label={`${ariaLabel}: значение`}
              value={draft.value}
              onChange={(event) =>
                setDraft((current) => ({ ...current, value: event.target.value }))
              }
              type={kind === "number" ? "number" : "text"}
              placeholder={kind === "text" ? "Значение" : "Число"}
              className="h-8 w-full rounded border border-line bg-field px-2 text-xs"
            />
          )}
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="inline-flex h-8 items-center gap-1 text-xs text-copy-muted hover:text-brand"
            >
              <IconX className="size-3.5" />
              Сбросить
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-8 rounded-md bg-brand px-3 text-xs text-white hover:bg-brand-dark"
            >
              Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
