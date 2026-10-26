"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ActionMessage({
  state,
}: {
  state: { error?: string; conflict?: boolean; success?: string };
}) {
  if (state.error)
    return (
      <div role="alert" aria-live="assertive" className="grid gap-2">
        <p className="text-sm font-medium text-brand">{state.error}</p>
        {state.conflict ? <RefreshDataButton /> : null}
      </div>
    );
  if (state.success)
    return (
      <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">
        {state.success}
      </p>
    );
  return null;
}

function RefreshDataButton() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={refreshing}
      className="justify-self-start text-sm font-bold text-slate-700 underline underline-offset-4 hover:text-brand disabled:cursor-wait disabled:opacity-60"
    >
      {refreshing ? "Обновляем…" : "Обновить данные"}
    </button>
  );
}
