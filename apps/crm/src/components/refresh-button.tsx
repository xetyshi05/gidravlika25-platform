"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "@/components/icons";

export function RefreshButton() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={refreshing}
      className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60"
    >
      <RefreshIcon className={`size-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      {refreshing ? "Обновляем…" : "Обновить"}
    </button>
  );
}
