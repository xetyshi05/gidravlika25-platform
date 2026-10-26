"use client";

import { IconHistory, IconRefresh, IconRestore } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomSelect, LoadingState } from "@/components/ui";
import { TablePagination } from "@/components/table-controls";
import { activityActions } from "@/lib/activity-actions";
import {
  BackofficeApiError,
  getBackofficeActivities,
  getUsers,
  type ActivityScope,
  type BackofficeActivity,
  type ManagedUser,
} from "@/lib/backoffice-api";

const scopes: { value: ActivityScope; label: string }[] = [
  { value: "ALL", label: "Все" },
  { value: "AUTH", label: "Аутентификация" },
  { value: "CATALOG", label: "Каталог" },
  { value: "USERS", label: "Пользователи" },
];
const actions = [{ value: "", label: "Все действия" }, ...activityActions];

export function ActivityJournal() {
  const [activities, setActivities] = useState<BackofficeActivity[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<ActivityScope>("ALL");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getBackofficeActivities({
        page: page - 1,
        pageSize,
        scope,
        ...(action ? { action } : {}),
        ...(userId ? { userId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
      setActivities(result.items);
      setTotal(result.total);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError
          ? cause.message
          : "Не удалось загрузить журнал действий.",
      );
    } finally {
      setLoading(false);
    }
  }, [action, dateFrom, dateTo, page, pageSize, scope, userId]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    void getUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);
  const userOptions = useMemo(
    () => [
      { value: "", label: "Все сотрудники" },
      ...users.map((user) => ({ value: user.id, label: user.name })),
    ],
    [users],
  );
  const reset = () => {
    setScope("ALL");
    setAction("");
    setUserId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };
  const selectScope = (next: ActivityScope) => {
    setScope(next);
    setAction("");
    setPage(1);
  };
  const hasFilters = scope !== "ALL" || Boolean(action || userId || dateFrom || dateTo);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-field px-5 py-4">
        <div className="flex items-center gap-2">
          <IconHistory className="size-5 text-brand" />
          <div>
            <h2 className="font-semibold text-copy">Все действия</h2>
            <p className="mt-0.5 text-xs text-copy-muted">
              {loading && activities.length === 0 ? "Загрузка событий…" : `${total} событий`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-tooltip="Сбросить фильтры"
            aria-label="Сбросить фильтры"
            disabled={!hasFilters}
            onClick={reset}
            className="bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-brand disabled:opacity-40"
          >
            <IconRestore className="size-4" />
          </button>
          <button
            type="button"
            data-tooltip="Обновить журнал"
            aria-label="Обновить журнал"
            disabled={loading}
            onClick={() => void load()}
            className="bo-tooltip-left bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-brand disabled:opacity-40"
          >
            <IconRefresh className={"size-4 " + (loading ? "animate-spin" : "")} />
          </button>
        </div>
      </div>
      <div className="border-b border-line bg-surface-raised/30 px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {scopes.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => selectScope(item.value)}
              className={
                "h-8 rounded-md border px-3 text-xs font-medium transition-colors " +
                (scope === item.value
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-copy-muted hover:bg-field hover:text-copy")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs text-copy-faint">Сотрудник</label>
            <CustomSelect
              ariaLabel="Фильтр по сотруднику"
              value={userId}
              onChange={(value) => {
                setUserId(value);
                setPage(1);
              }}
              options={userOptions}
              size="compact"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-copy-faint">Действие</label>
            <CustomSelect
              ariaLabel="Фильтр по действию"
              value={action}
              onChange={(value) => {
                setAction(value);
                setPage(1);
              }}
              options={actions}
              size="compact"
            />
          </div>
          <label>
            <span className="mb-1.5 block text-xs text-copy-faint">С даты</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-md border border-line bg-field px-2 text-xs text-copy"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs text-copy-faint">По дату</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-md border border-line bg-field px-2 text-xs text-copy"
            />
          </label>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="border-b border-line bg-brand-soft/40 px-5 py-3 text-sm text-brand"
        >
          {error}
        </p>
      )}
      <div className="divide-y divide-line">
        {loading && activities.length === 0 ? (
          <LoadingState label="Загружаем журнал действий…" />
        ) : activities.length ? (
          activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)
        ) : !error ? (
          <div className="px-5 py-12 text-center">
            <IconHistory className="mx-auto size-7 text-copy-faint" />
            <p className="mt-3 text-sm text-copy-muted">События не найдены.</p>
            <p className="mt-1 text-xs text-copy-faint">
              {hasFilters
                ? "Измените условия фильтрации или сбросьте их."
                : "Новые действия сотрудников появятся здесь автоматически."}
            </p>
          </div>
        ) : null}
      </div>
      {!loading || activities.length > 0 ? (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      ) : null}
    </section>
  );
}

function ActivityRow({ activity }: { activity: BackofficeActivity }) {
  const [title, description] = activityText(activity);
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(activity.createdAt));
  const scope = activityScope(activity.action);
  const scopeLabel =
    scope === "AUTH" ? "Аутентификация" : scope === "CATALOG" ? "Каталог" : "Пользователи";
  const tone =
    scope === "AUTH" ? "bg-sky-400" : scope === "CATALOG" ? "bg-emerald-400" : "bg-brand";
  return (
    <div className="px-5 py-3.5">
      <div className="flex gap-3">
        <span className={"mt-1.5 size-2 shrink-0 rounded-full " + tone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-copy">{title}</p>
            <span className="rounded border border-line bg-field px-1.5 py-0.5 text-[10px] text-copy-faint">
              {scopeLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-copy-muted">{description}</p>
          <ActivityDetails activity={activity} />
          <div className="mt-2 flex justify-between gap-3 text-[11px] text-copy-faint">
            <span className="truncate">{activity.user?.name ?? "Система"}</span>
            <time dateTime={activity.createdAt}>{date}</time>
          </div>
        </div>
      </div>
    </div>
  );
}

function activityScope(action: string): Exclude<ActivityScope, "ALL"> {
  return action.startsWith("AUTH_") ? "AUTH" : action.startsWith("USER_") ? "USERS" : "CATALOG";
}
function activityText(activity: BackofficeActivity): [string, string] {
  const count = typeof activity.details?.count === "number" ? activity.details.count : null;
  const name = typeof activity.details?.name === "string" ? activity.details.name : null;
  const destination = applicationLabel(activity.details?.application);
  const totpReplayRejected = activity.details?.reason === "TOTP_REPLAY";
  const failures =
    typeof activity.details?.failures === "number" ? activity.details.failures : null;
  const lockedUntil =
    typeof activity.details?.lockedUntil === "string"
      ? new Date(activity.details.lockedUntil).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const texts: Record<string, [string, string]> = {
    SETTINGS_UPDATED: ["Настройки каталога обновлены", "Изменены правила отображения каталога."],
    PRODUCT_CREATED: ["Добавлен товар", name ?? "Создана новая товарная позиция."],
    PRODUCT_UPDATED: ["Товар обновлён", name ?? "Изменены данные товара."],
    PRODUCT_IMAGE_UPDATED: ["Фото товара обновлено", name ?? "Загружено новое изображение товара."],
    PRODUCTS_BULK_UPDATED: [
      "Товары обновлены",
      count ? "Изменено товаров: " + count + "." : "Изменены выбранные товары.",
    ],
    PRODUCTS_DELETED: [
      "Товары удалены",
      count ? "Удалено товаров: " + count + "." : "Удалены товарные позиции.",
    ],
    STOCK_CHANGED: ["Остаток изменён", name ?? "Изменено количество товара."],
    STOCK_BULK_CHANGED: [
      "Остатки изменены",
      count ? "Изменено товаров: " + count + "." : "Обновлены остатки.",
    ],
    CATEGORY_CREATED: ["Добавлена категория", name ?? "Создана новая категория."],
    CATEGORY_UPDATED: ["Категория обновлена", name ?? "Изменены данные категории."],
    CATEGORIES_BULK_UPDATED: [
      "Категории обновлены",
      count ? "Изменено категорий: " + count + "." : "Изменены выбранные категории.",
    ],
    CATEGORIES_DELETED: [
      "Категории удалены",
      count ? "Удалено категорий: " + count + "." : "Удалены категории.",
    ],
    USER_CREATED: ["Добавлен пользователь", name ?? "Создана учётная запись."],
    USER_UPDATED: ["Пользователь обновлён", name ?? "Изменены данные учётной записи."],
    USER_PASSWORD_CHANGED: ["Пароль изменён", "Все активные сессии пользователя завершены."],
    USER_TWO_FACTOR_RESET: [
      "Сброшена двухфакторная аутентификация",
      "При следующем входе пользователь подключит новое приложение-аутентификатор.",
    ],
    USER_SESSIONS_REVOKED: [
      "Сессии завершены",
      count ? "Завершено сессий: " + count + "." : "Активных сессий не было.",
    ],
    USER_SESSION_REVOKED: [
      "Сессия завершена",
      "Администратор отозвал одну активную сессию пользователя.",
    ],
    AUTH_LOGIN_SUCCEEDED: [
      "Вход в систему",
      `Создана новая защищённая сессия${destination ? ` в ${destination}` : ""}.`,
    ],
    AUTH_LOGIN_FAILED: [
      "Неудачная попытка входа",
      `Проверка учётных данных${destination ? ` для ${destination}` : ""} не пройдена.`,
    ],
    AUTH_LOGIN_ACCOUNT_LOCKED: [
      "Вход временно приостановлен",
      `После ${failures ?? "нескольких"} неверных паролей вход в учётную запись приостановлен${lockedUntil ? ` до ${lockedUntil}` : ""}.`,
    ],
    AUTH_TWO_FACTOR_ACCOUNT_LOCKED: [
      "Подтверждение 2FA приостановлено",
      `После ${failures ?? "нескольких"} неверных кодов вход в учётную запись приостановлен${lockedUntil ? ` до ${lockedUntil}` : ""}.`,
    ],
    AUTH_LOGIN_ADDRESS_RATE_LIMITED: [
      "Ограничен адрес входа",
      `Превышен минутный лимит попыток${destination ? ` в ${destination}` : ""} с одного сетевого адреса.`,
    ],
    AUTH_LOGIN_APP_FORBIDDEN: [
      "Вход запрещён",
      `У пользователя нет доступа${destination ? ` к ${destination}` : " к приложению"}.`,
    ],
    AUTH_TWO_FACTOR_ENABLED: [
      "Подключена двухфакторная аутентификация",
      `Приложение-аутентификатор успешно привязано${destination ? ` при входе в ${destination}` : ""}.`,
    ],
    AUTH_TWO_FACTOR_FAILED: [
      totpReplayRejected
        ? "Отклонён повторный код двухфакторной аутентификации"
        : "Неверный код двухфакторной аутентификации",
      totpReplayRejected
        ? `Уже использованный код не принят${destination ? ` при входе в ${destination}` : ""}.`
        : `Подтверждение входа${destination ? ` в ${destination}` : ""} не пройдено.`,
    ],
    AUTH_RECOVERY_CODE_USED: [
      "Использован резервный код",
      `Один резервный код использован${destination ? ` для входа в ${destination}` : ""} и погашен.`,
    ],
    AUTH_RECOVERY_CODES_REGENERATED: [
      "Перевыпущены резервные коды",
      `Старый набор аннулирован, создан новый${destination ? ` в ${destination}` : ""}.`,
    ],
    AUTH_LOGOUT: [
      "Выход из системы",
      `Сессия пользователя${destination ? ` в ${destination}` : ""} завершена.`,
    ],
    AUTH_EXPIRED_SESSIONS_CLEANED: [
      "Удалены истёкшие сессии",
      count ? "Удалено сессий: " + count + "." : "Истёкших сессий не было.",
    ],
  };
  return texts[activity.action] ?? ["Выполнено действие", activity.entity];
}

function ActivityDetails({ activity }: { activity: BackofficeActivity }) {
  const details = activity.details;
  if (!details) return null;
  const changes = auditEntries(details.changes, true);
  const values = [
    ...auditEntries(details.values, false),
    ...auditEntries(
      Object.fromEntries(
        ["role", "isActive", "stockQuantity"]
          .filter((key) => details[key] !== undefined)
          .map((key) => [key, details[key]]),
      ),
      false,
    ),
  ].filter(
    (value, index, entries) => entries.findIndex((entry) => entry.key === value.key) === index,
  );
  const items = Array.isArray(details.items)
    ? details.items
        .map((item) =>
          isRecord(item) && typeof item.name === "string"
            ? `${typeof item.sku === "string" ? `${item.sku} — ` : ""}${item.name}`
            : null,
        )
        .filter((item): item is string => Boolean(item))
    : [];
  const delta = typeof details.delta === "number" ? details.delta : null;
  const sizeBytes = typeof details.sizeBytes === "number" ? details.sizeBytes : null;
  const target =
    typeof details.login === "string"
      ? `${typeof details.name === "string" ? `${details.name} · ` : ""}${details.login}`
      : typeof details.sku === "string"
        ? `${details.sku}${typeof details.name === "string" ? ` — ${details.name}` : ""}`
        : null;
  if (
    !changes.length &&
    !values.length &&
    !items.length &&
    delta === null &&
    sizeBytes === null &&
    !target
  )
    return null;

  return (
    <div className="mt-2 grid gap-1 border-l border-line pl-3 text-[11px] leading-5 text-copy-faint">
      {target ? (
        <p>
          <span className="text-copy-muted">Объект:</span> {target}
        </p>
      ) : null}
      {changes.map((change) => (
        <p key={change.key}>
          <span className="text-copy-muted">{change.label}:</span> {change.from} → {change.to}
        </p>
      ))}
      {values.map((value) => (
        <p key={value.key}>
          <span className="text-copy-muted">{value.label}:</span> {value.to}
        </p>
      ))}
      {delta !== null ? (
        <p>
          <span className="text-copy-muted">Изменение остатка:</span> {delta > 0 ? "+" : ""}
          {delta} шт.
        </p>
      ) : null}
      {sizeBytes !== null ? (
        <p>
          <span className="text-copy-muted">Файл изображения:</span> {formatBytes(sizeBytes)}
          {typeof details.contentType === "string" ? ` · ${details.contentType}` : ""}
        </p>
      ) : null}
      {items.length ? (
        <p>
          <span className="text-copy-muted">Затронуты:</span> {items.join("; ")}
          {details.itemsTruncated === true ? "; …" : ""}
        </p>
      ) : null}
    </div>
  );
}

const activityFieldLabels: Record<string, string> = {
  name: "Название",
  login: "Логин",
  role: "Роль",
  isActive: "Активность",
  sku: "Артикул",
  slug: "Адрес страницы",
  category: "Категория",
  categoryId: "Категория",
  price: "Цена",
  description: "Описание",
  shortDescription: "Краткое описание",
  pistonDiameterMm: "Диаметр поршня",
  rodDiameterMm: "Диаметр штока",
  strokeMm: "Ход",
  collapsedLengthMm: "Длина в сложенном виде",
  maxPressureMpa: "Максимальное давление",
  nominalPressureMpa: "Номинальное давление",
  stockQuantity: "Остаток",
  isFeatured: "Рекомендуемый товар",
  parent: "Родительская категория",
  lowStockThreshold: "Порог малого остатка",
  showOutOfStock: "Показывать товары под заказ",
  showPrices: "Показывать цены",
};

function auditEntries(value: unknown, changes: boolean) {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (changes) {
      if (!isRecord(entry)) return [];
      return [
        {
          key,
          label: activityFieldLabels[key] ?? key,
          from: formatAuditValue(entry.from, key),
          to: formatAuditValue(entry.to, key),
        },
      ];
    }
    return [
      {
        key,
        label: activityFieldLabels[key] ?? key,
        from: "",
        to: formatAuditValue(entry, key),
      },
    ];
  });
}

function formatAuditValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return "не задано";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (field === "role") return value === "ADMIN" ? "Администратор" : "Менеджер";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function applicationLabel(value: unknown) {
  return value === "CRM" ? "CRM" : value === "BACKOFFICE" ? "Backoffice" : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}
