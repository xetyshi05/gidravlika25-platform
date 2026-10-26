"use client";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlertCircle, IconBox, IconCheck, IconPlus } from "@tabler/icons-react";
export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line px-5 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-10">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
          {eyebrow ?? "КАТАЛОГ"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-copy sm:text-4xl">{title}</h1>
      </div>
      {action}
    </header>
  );
}
export function PrimaryButton({
  children,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-normal text-white transition-colors hover:bg-brand-dark"
    >
      <IconPlus className="size-4" />
      {children}
    </button>
  );
}
export function StatusBadge({ active }: { active: boolean; stock?: number }) {
  const [label, classes] = active
    ? ["Активен", "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"]
    : ["Неактивен", "border-zinc-500/40 bg-zinc-500/15 text-zinc-300"];
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-normal ${classes}`}>
      {label}
    </span>
  );
}
export function AvailabilityBadge({ stock }: { stock: number }) {
  const [label, classes] =
    stock === 0
      ? ["Нет в наличии", "border-red-500/30 bg-red-500/10 text-red-300"]
      : stock <= 5
        ? ["Мало", "border-amber-500/30 bg-amber-500/10 text-amber-300"]
        : ["В наличии", "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"];
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-normal ${classes}`}>
      {label}
    </span>
  );
}
export function CustomSelect({
  value,
  onChange,
  options,
  ariaLabel,
  size = "default",
  trigger,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: ReactNode }[];
  ariaLabel: string;
  size?: "default" | "compact";
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const show = (index = selectedIndex) => {
    setActiveIndex(index);
    setOpen(true);
  };
  const move = (index: number) => {
    if (!options.length) return;
    setActiveIndex((index + options.length) % options.length);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };
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
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);
  const label = options.find((option) => option.value === value)?.label ?? "Выберите";
  const buttonClass =
    "flex items-center rounded-md border border-line bg-field text-left font-normal text-copy transition-colors hover:border-copy-faint focus:border-brand focus:outline-none " +
    (trigger
      ? "size-8 justify-center"
      : "w-full justify-between " +
        (size === "compact" ? "h-8 px-2 text-xs" : "h-10 px-3 text-sm"));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={
          open && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
        }
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open)
              show(
                event.key === "ArrowDown"
                  ? selectedIndex >= 0
                    ? selectedIndex
                    : 0
                  : selectedIndex >= 0
                    ? (selectedIndex - 1 + options.length) % options.length
                    : options.length - 1,
              );
            else move(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            if (!open) show(event.key === "Home" ? 0 : options.length - 1);
            else move(event.key === "Home" ? 0 : options.length - 1);
          } else if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            choose(activeIndex);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === "Tab") setOpen(false);
        }}
        className={buttonClass}
      >
        {trigger ? (
          trigger
        ) : (
          <>
            <span className="truncate">{label}</span>
            <span className="bo-select-chevron ml-3 text-copy-faint" />
          </>
        )}
      </button>
      {present && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={
            "bo-select-menu absolute z-30 mt-1 max-h-60 overflow-auto rounded-md border border-line bg-surface p-1 shadow-xl " +
            (trigger ? "right-0 min-w-48 " : "w-full ") +
            (open ? "bo-select-menu-enter" : "bo-select-menu-leave")
          }
        >
          {options.map((option, index) => (
            <button
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              key={option.value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              className={
                "flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-normal transition-colors hover:bg-brand-soft hover:text-brand " +
                (index === activeIndex ? "bg-brand-soft text-brand " : "") +
                (option.value === value ? "text-brand" : "text-copy")
              }
            >
              {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function Checkbox({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`bo-checkbox ${checked ? "bo-checkbox-checked" : ""} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <IconCheck className="size-3.5 stroke-[3]" />
    </button>
  );
}
export function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "border-brand bg-brand" : "border-copy-faint bg-field hover:border-brand"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 size-4.5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center border border-dashed border-line bg-surface px-6 text-center">
      <div>
        <IconBox className="mx-auto size-8 text-copy-faint" />
        <h2 className="mt-3 font-normal text-copy">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-copy-muted">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
export function LoadingState({ label = "Загружаем данные…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="grid min-h-56 place-items-center px-6 text-center"
    >
      <div className="w-full max-w-xs animate-pulse">
        <div className="mx-auto h-8 w-8 rounded-full bg-surface-raised" />
        <div className="mx-auto mt-4 h-3 w-40 rounded-sm bg-surface-raised" />
        <div className="mx-auto mt-3 h-3 w-56 max-w-full rounded-sm bg-field" />
        <p className="mt-4 text-xs text-copy-faint">{label}</p>
      </div>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-brand/35 bg-brand-soft/60 p-3 text-sm text-copy-muted">
      <IconAlertCircle className="mt-0.5 size-4 shrink-0 text-brand" />
      {children}
    </div>
  );
}
export function Toaster() {
  const [message, setMessage] = useState<string | null>(null),
    [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const show = (event: Event) => {
      setLeaving(false);
      setMessage((event as CustomEvent<string>).detail);
      window.setTimeout(() => setLeaving(true), 2900);
      window.setTimeout(() => setMessage(null), 3160);
    };
    window.addEventListener("backoffice:notice", show);
    return () => window.removeEventListener("backoffice:notice", show);
  }, []);
  return message ? (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-5 top-5 z-50 flex items-center gap-3 rounded-md border border-brand bg-brand-soft px-4 py-3 text-sm text-copy shadow-xl ${leaving ? "bo-toast-leave" : "bo-toast-enter"}`}
    >
      <span className="grid size-5 place-items-center rounded-full bg-brand text-xs text-white">
        ✓
      </span>
      {message}
    </div>
  ) : null;
}
type TooltipState = {
  label: string;
  placement: "top" | "bottom" | "left";
  rect: { top: number; right: number; bottom: number; left: number; width: number; height: number };
};
export function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  useEffect(() => {
    const getTarget = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>("[data-tooltip]") : null;
    const show = (node: EventTarget | null) => {
      const target = getTarget(node);
      const label = target?.dataset.tooltip;
      if (!target || !label || target.matches(":disabled")) return;
      const rect = target.getBoundingClientRect();
      const placement = target.classList.contains("bo-tooltip-bottom")
        ? "bottom"
        : target.classList.contains("bo-tooltip-left")
          ? "left"
          : "top";
      setTooltip({
        label,
        placement,
        rect: {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
    };
    const hide = (event?: MouseEvent | FocusEvent) => {
      const target = getTarget(event?.target ?? null);
      const related = event?.relatedTarget;
      if (target && related instanceof Node && target.contains(related)) return;
      setTooltip(null);
    };
    const onMouseOver = (event: MouseEvent) => show(event.target);
    const onFocus = (event: FocusEvent) => show(event.target);
    const onScroll = () => setTooltip(null);
    const onResize = () => setTooltip(null);
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("mouseout", hide);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const style = useMemo(() => {
    if (!tooltip) return undefined;
    const gap = 10;
    const centerX = tooltip.rect.left + tooltip.rect.width / 2;
    const centerY = tooltip.rect.top + tooltip.rect.height / 2;
    if (tooltip.placement === "bottom")
      return {
        left: Math.max(12, Math.min(window.innerWidth - 12, centerX)),
        top: tooltip.rect.bottom + gap,
        transform: "translateX(-50%)",
      };
    if (tooltip.placement === "left")
      return {
        left: tooltip.rect.left - gap,
        top: Math.max(12, Math.min(window.innerHeight - 12, centerY)),
        transform: "translate(-100%, -50%)",
      };
    return {
      left: Math.max(12, Math.min(window.innerWidth - 12, centerX)),
      top: tooltip.rect.top - gap,
      transform: "translate(-50%, -100%)",
    };
  }, [tooltip]);
  return tooltip ? (
    <div
      role="tooltip"
      className={`bo-global-tooltip bo-global-tooltip-${tooltip.placement}`}
      style={style}
    >
      {tooltip.label}
    </div>
  ) : null;
}
