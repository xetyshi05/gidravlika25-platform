"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconCpu,
  IconDatabase,
  IconDeviceDesktopAnalytics,
  IconRefresh,
} from "@tabler/icons-react";
import { getServerResources, type ResourceUsage, type ServerResources } from "@/lib/backoffice-api";

const refreshIntervalMs = 30_000;

export function ServerResourcesPanel() {
  const [resources, setResources] = useState<ServerResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const nextResources = await getServerResources();
      setResources(nextResources);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось получить ресурсы сервера.");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const interval = window.setInterval(() => void load(true), refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [load]);

  return (
    <section
      className="rounded-md border border-line bg-surface"
      aria-labelledby="server-resources-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${error && !resources ? "bg-brand" : "bg-emerald-500"}`}
            />
            <h2 id="server-resources-title" className="font-bold">
              Ресурсы сервера
            </h2>
          </div>
          <p className="mt-1 text-xs text-copy-muted">
            {resources
              ? `Обновлено ${formatCheckedAt(resources.checkedAt)} · автоматически каждые 30 секунд`
              : "CPU, оперативная память, диск и доступность API"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Обновить статус ресурсов сервера"
          data-tooltip="Обновить"
          className="bo-tooltip grid size-9 place-items-center rounded-md border border-line text-copy-muted hover:border-copy-faint hover:text-copy disabled:opacity-50"
        >
          <IconRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && !resources ? (
        <div role="alert" className="p-5 text-sm text-brand">
          Сервер недоступен: {error}
        </div>
      ) : resources ? (
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          <ResourceCard
            icon={IconCpu}
            label="Нагрузка CPU"
            percent={resources.cpu.loadPercent}
            details={`${formatNumber(resources.cpu.loadAverage1m)} за 1 мин · ${resources.cpu.cores} ядер`}
          />
          <ResourceCard
            icon={IconDeviceDesktopAnalytics}
            label="Оперативная память"
            usage={resources.memory}
          />
          <ResourceCard icon={IconDatabase} label="Диск" usage={resources.disk} />
          <div className="bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-copy-muted">API</p>
            <p className="mt-3 text-2xl font-extrabold text-emerald-400">Онлайн</p>
            <p className="mt-2 text-xs text-copy-muted">
              Работает {formatUptime(resources.uptimeSeconds)}
            </p>
          </div>
        </div>
      ) : (
        <div
          className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Загрузка ресурсов сервера"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse bg-surface p-5">
              <div className="h-3 w-24 rounded bg-surface-raised" />
              <div className="mt-5 h-8 w-20 rounded bg-surface-raised" />
            </div>
          ))}
        </div>
      )}

      {error && resources ? (
        <p role="status" className="border-t border-line px-5 py-3 text-xs text-amber-400">
          Не удалось обновить данные: показано последнее успешное измерение.
        </p>
      ) : null}
    </section>
  );
}

function ResourceCard({
  icon: Icon,
  label,
  usage,
  percent = usage?.usedPercent,
  details = usage
    ? `${formatBytes(usage.usedBytes)} из ${formatBytes(usage.totalBytes)}`
    : undefined,
}: {
  icon: typeof IconCpu;
  label: string;
  usage?: ResourceUsage | null;
  percent?: number;
  details?: string;
}) {
  const available = percent !== undefined;
  const value = percent ?? 0;
  const color = value >= 85 ? "bg-brand" : value >= 70 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="bg-surface p-5">
      <div className="flex items-center gap-2 text-copy-muted">
        <Icon className="size-4" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-extrabold">{available ? `${formatNumber(value)}%` : "—"}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 text-xs text-copy-muted">{details ?? "Данные диска недоступны"}</p>
    </div>
  );
}

function formatBytes(value: number) {
  const gibibyte = 1024 ** 3;
  return `${formatNumber(value / gibibyte)} ГБ`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days} д. ${hours} ч.`;
  if (hours > 0) return `${hours} ч. ${minutes} мин.`;
  return `${minutes} мин.`;
}
