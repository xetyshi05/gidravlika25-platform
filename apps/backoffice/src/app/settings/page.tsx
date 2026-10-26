"use client";

import { IconAlertTriangle, IconCoin, IconDeviceFloppy, IconPackageOff } from "@tabler/icons-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LoadingState, Notice, PageHeader, Switch } from "@/components/ui";
import {
  BackofficeApiError,
  getSettings,
  saveSettings,
  type CatalogSettings,
} from "@/lib/backoffice-api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<CatalogSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextSettings = await getSettings();
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError
          ? cause.message
          : "Не удалось загрузить настройки каталога.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const update = <Key extends keyof CatalogSettings>(key: Key, value: CatalogSettings[Key]) =>
    setSettings((current) => (current ? { ...current, [key]: value } : current));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    if (!Number.isSafeInteger(settings.lowStockThreshold) || settings.lowStockThreshold < 0) {
      setError("Порог малого остатка должен быть целым неотрицательным числом.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const saved = await saveSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", { detail: "Настройки каталога сохранены" }),
      );
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError
          ? cause.message
          : "Не удалось сохранить настройки каталога.",
      );
    } finally {
      setSaving(false);
    }
  };

  const changed =
    settings !== null &&
    savedSettings !== null &&
    (settings.lowStockThreshold !== savedSettings.lowStockThreshold ||
      settings.showOutOfStock !== savedSettings.showOutOfStock ||
      settings.showPrices !== savedSettings.showPrices);

  return (
    <main>
      <PageHeader eyebrow="КАТАЛОГ" title="Настройки" />
      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:px-10">
        {loading ? (
          <section className="rounded-md border border-line bg-surface">
            <LoadingState label="Загружаем настройки…" />
          </section>
        ) : settings ? (
          <form onSubmit={submit} className="grid gap-5">
            {error ? <Notice>{error}</Notice> : null}

            <section className="overflow-hidden rounded-md border border-line bg-surface">
              <SettingRow
                icon={<IconCoin className="size-5" />}
                title="Показывать цены"
                description="Цена отображается в каталоге, карточке товара и корзине. Если выключить, покупатель увидит «По запросу»."
              >
                <Switch
                  checked={settings.showPrices}
                  onCheckedChange={(checked) => update("showPrices", checked)}
                  ariaLabel="Показывать цены"
                />
              </SettingRow>
              <SettingRow
                icon={<IconPackageOff className="size-5" />}
                title="Показывать товары без остатка"
                description="Если выключить, товары с нулевым остатком исчезнут из каталога, поиска и прямых страниц товара."
              >
                <Switch
                  checked={settings.showOutOfStock}
                  onCheckedChange={(checked) => update("showOutOfStock", checked)}
                  ariaLabel="Показывать товары без остатка"
                />
              </SettingRow>
              <SettingRow
                icon={<IconAlertTriangle className="size-5" />}
                title="Порог малого остатка"
                description="При остатке от 1 до указанного значения товар получает статус «Осталось мало». Ноль отключает предупреждение."
              >
                <label className="grid gap-1.5 text-xs font-medium text-copy-muted">
                  Количество
                  <input
                    type="number"
                    min={0}
                    max={1_000_000_000}
                    step={1}
                    required
                    value={settings.lowStockThreshold}
                    onChange={(event) =>
                      update("lowStockThreshold", Number(event.currentTarget.value))
                    }
                    className="h-10 w-32 rounded-md border border-line bg-field px-3 text-sm text-copy"
                  />
                </label>
              </SettingRow>
            </section>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={!changed || saving}
                onClick={() => setSettings(savedSettings)}
                className="h-10 rounded-md border border-line px-4 text-sm text-copy-muted hover:border-copy-faint hover:text-copy disabled:cursor-not-allowed disabled:opacity-40"
              >
                Отменить изменения
              </button>
              <button
                type="submit"
                disabled={!changed || saving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconDeviceFloppy className="size-4" />
                {saving ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </form>
        ) : (
          <Notice>
            Не удалось получить настройки. Обновите страницу или повторите попытку позже.
          </Notice>
        )}
      </div>
    </main>
  );
}

function SettingRow({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5 border-b border-line p-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
      <div className="flex gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-line bg-field text-brand">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-copy">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-copy-muted">{description}</p>
        </div>
      </div>
      <div className="sm:pl-5">{children}</div>
    </div>
  );
}
