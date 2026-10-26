"use client";

import {
  IconDevices,
  IconEdit,
  IconKey,
  IconLogout2,
  IconRefresh,
  IconShieldOff,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Checkbox,
  CustomSelect,
  LoadingState,
  PageHeader,
  PrimaryButton,
  StatusBadge,
  Switch,
} from "@/components/ui";
import { useConfirmation } from "@/components/confirmation-dialog";
import {
  BackofficeApiError,
  createUser,
  getBackofficeUser,
  getUserSessions,
  getUsers,
  resetUserTwoFactor,
  revokeUserSession,
  revokeUserSessions,
  updateUser,
  updateUserPassword,
  type BackofficeUser,
  type ManagedUser,
  type UserSession,
} from "@/lib/backoffice-api";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type Editor =
  | { mode: "create" }
  | { mode: "edit"; user: ManagedUser }
  | { mode: "password"; user: ManagedUser };
type UserForm = {
  name: string;
  login: string;
  password: string;
  role: "ADMIN" | "MANAGER";
  confirmLoginChange: boolean;
};
const emptyForm: UserForm = {
  name: "",
  login: "",
  password: "",
  role: "MANAGER",
  confirmLoginChange: false,
};
/** The API stores logins trimmed and lower-cased. */
const normalizeLogin = (login: string) => login.trim().toLowerCase();
const roleOptions = [
  { value: "MANAGER", label: "Менеджер — доступ только к CRM" },
  { value: "ADMIN", label: "Администратор — CRM и back office" },
];

export default function UsersPage() {
  const confirm = useConfirmation();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUser, setCurrentUser] = useState<BackofficeUser | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [sessionsUser, setSessionsUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextCurrentUser] = await Promise.all([getUsers(), getBackofficeUser()]);
      setUsers(nextUsers);
      setCurrentUser(nextCurrentUser);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError ? cause.message : "Не удалось загрузить пользователей.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditor({ mode: "create" });
  };
  const openEdit = (user: ManagedUser) => {
    setForm({ ...emptyForm, name: user.name, login: user.login, role: user.role });
    setEditor({ mode: "edit", user });
  };
  const openPassword = (user: ManagedUser) => {
    setForm({ ...emptyForm, role: user.role });
    setEditor({ mode: "password", user });
  };
  const set = <Key extends keyof UserForm>(key: Key, value: UserForm[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.mode === "create") {
        await createUser({
          name: form.name.trim(),
          login: form.login.trim(),
          password: form.password,
          role: form.role,
        });
        notify("Пользователь добавлен");
      } else if (editor.mode === "edit") {
        const login = normalizeLogin(form.login);
        await updateUser(editor.user.id, {
          name: form.name.trim(),
          ...(login === editor.user.login ? {} : { login }),
          role: form.role,
        });
        notify("Пользователь обновлён");
      } else {
        await updateUserPassword(editor.user.id, form.password);
        notify("Пароль изменён, все сессии завершены");
      }
      setEditor(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError ? cause.message : "Не удалось сохранить пользователя.",
      );
    } finally {
      setSaving(false);
    }
  };
  const toggleActive = async (user: ManagedUser) => {
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      notify(user.isActive ? "Пользователь отключён" : "Пользователь активирован");
      await load();
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError
          ? cause.message
          : "Не удалось изменить статус пользователя.",
      );
    }
  };
  const revokeSessions = async (user: ManagedUser) => {
    if (
      !(await confirm({
        title: `Завершить все сессии пользователя «${user.name}»?`,
        description: "Пользователь будет разлогинен на всех устройствах.",
        confirmLabel: "Завершить сессии",
        tone: "primary",
      }))
    )
      return;
    try {
      const result = await revokeUserSessions(user.id);
      notify(result.revoked ? `Завершено сессий: ${result.revoked}` : "Активных сессий нет");
      await load();
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError ? cause.message : "Не удалось завершить сессии.",
      );
    }
  };
  const resetTwoFactor = async (user: ManagedUser) => {
    if (
      !(await confirm({
        title: `Сбросить двухфакторную аутентификацию для «${user.name}»?`,
        description:
          "Все сессии будут завершены, а при следующем входе потребуется привязать новое приложение.",
        confirmLabel: "Сбросить 2FA",
      }))
    )
      return;
    try {
      await resetUserTwoFactor(user.id);
      notify("Двухфакторная аутентификация сброшена");
      await load();
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError
          ? cause.message
          : "Не удалось сбросить двухфакторную аутентификацию.",
      );
    }
  };

  return (
    <main>
      <PageHeader
        eyebrow="СИСТЕМА"
        title="Пользователи"
        action={<PrimaryButton onClick={openCreate}>Добавить пользователя</PrimaryButton>}
      />
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:px-10">
        <section className="overflow-hidden rounded-md border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-field px-5 py-4">
            <div className="flex items-center gap-2">
              <IconUsers className="size-5 text-brand" />
              <div>
                <h2 className="font-semibold text-copy">Учётные записи</h2>
              </div>
            </div>
            <button
              type="button"
              data-tooltip="Обновить список"
              aria-label="Обновить список"
              disabled={loading}
              onClick={() => void load()}
              className="bo-tooltip-left bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-brand disabled:opacity-40"
            >
              <IconRefresh className={"size-4 " + (loading ? "animate-spin" : "")} />
            </button>
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
            {loading && users.length === 0 ? (
              <LoadingState label="Загружаем пользователей…" />
            ) : null}
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                currentUserId={currentUser?.id}
                onEdit={openEdit}
                onPassword={openPassword}
                onSessions={setSessionsUser}
                onToggleActive={() => void toggleActive(user)}
                onRevoke={() => void revokeSessions(user)}
                onResetTwoFactor={() => void resetTwoFactor(user)}
              />
            ))}
            {!loading && !users.length && !error && (
              <div className="px-5 py-12 text-center text-sm text-copy-muted">
                Пользователи не найдены.
              </div>
            )}
          </div>
        </section>
      </div>
      {editor && (
        <UserModal
          editor={editor}
          form={form}
          set={set}
          saving={saving}
          onClose={() => setEditor(null)}
          onSubmit={() => void save()}
        />
      )}
      {sessionsUser && (
        <SessionsModal
          user={sessionsUser}
          onClose={() => setSessionsUser(null)}
          onChanged={() => void load()}
        />
      )}
    </main>
  );
}

function UserRow({
  user,
  currentUserId,
  onEdit,
  onPassword,
  onSessions,
  onToggleActive,
  onRevoke,
  onResetTwoFactor,
}: {
  user: ManagedUser;
  currentUserId?: string;
  onEdit: (user: ManagedUser) => void;
  onPassword: (user: ManagedUser) => void;
  onSessions: (user: ManagedUser) => void;
  onToggleActive: () => void;
  onRevoke: () => void;
  onResetTwoFactor: () => void;
}) {
  const isCurrent = user.id === currentUserId;
  return (
    <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-copy">{user.name}</p>
          <span className="font-mono text-xs text-copy-muted">
            <span className="sr-only">Логин: </span>
            {user.login}
          </span>
          {isCurrent && (
            <span className="rounded border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
              ТЕКУЩИЙ
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-copy-muted">
          <span>{user.role === "ADMIN" ? "Администратор" : "Менеджер"}</span>
          <span>{user.twoFactorEnabled ? "2FA подключена" : "Требуется настройка 2FA"}</span>
          <span>
            {user.activeSessionCount
              ? `Активных сессий: ${user.activeSessionCount}`
              : "Нет активных сессий"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge active={user.isActive} />
        <div className="ml-1 flex overflow-hidden rounded-md border border-line">
          <button
            type="button"
            data-tooltip="Активные сессии"
            aria-label="Активные сессии"
            onClick={() => onSessions(user)}
            className="bo-tooltip grid size-9 place-items-center text-copy-muted hover:bg-surface-raised hover:text-brand"
          >
            <IconDevices className="size-4" />
          </button>
          <button
            type="button"
            data-tooltip="Редактировать"
            aria-label="Редактировать"
            onClick={() => onEdit(user)}
            className="bo-tooltip grid size-9 place-items-center border-l border-line text-copy-muted hover:bg-surface-raised hover:text-brand"
          >
            <IconEdit className="size-4" />
          </button>
          <button
            type="button"
            data-tooltip="Сменить пароль"
            aria-label="Сменить пароль"
            onClick={() => onPassword(user)}
            className="bo-tooltip grid size-9 place-items-center border-l border-line text-copy-muted hover:bg-surface-raised hover:text-brand"
          >
            <IconKey className="size-4" />
          </button>
          <button
            type="button"
            data-tooltip="Сбросить двухфакторную аутентификацию"
            aria-label="Сбросить двухфакторную аутентификацию"
            onClick={onResetTwoFactor}
            className="bo-tooltip grid size-9 place-items-center border-l border-line text-copy-muted hover:bg-surface-raised hover:text-brand"
          >
            <IconShieldOff className="size-4" />
          </button>
          <button
            type="button"
            data-tooltip="Завершить сессии"
            aria-label="Завершить сессии"
            onClick={onRevoke}
            className="bo-tooltip grid size-9 place-items-center border-l border-line text-copy-muted hover:bg-surface-raised hover:text-brand"
          >
            <IconLogout2 className="size-4" />
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-copy-muted">
          <Switch
            ariaLabel={`Пользователь ${user.name} активен`}
            checked={user.isActive}
            onCheckedChange={onToggleActive}
            disabled={isCurrent}
          />
          {user.isActive ? "Активен" : "Отключён"}
        </label>
      </div>
    </div>
  );
}

function UserModal({
  editor,
  form,
  set,
  saving,
  onClose,
  onSubmit,
}: {
  editor: Editor;
  form: UserForm;
  set: <Key extends keyof UserForm>(key: Key, value: UserForm[Key]) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isCreate = editor.mode === "create";
  const isPassword = editor.mode === "password";
  const title = isCreate
    ? "Новый пользователь"
    : isPassword
      ? `Новый пароль: ${editor.user.name}`
      : `Редактирование: ${editor.user.name}`;
  const loginChanged = editor.mode === "edit" && normalizeLogin(form.login) !== editor.user.login;
  const valid = isPassword
    ? form.password.length >= 12
    : form.name.trim().length > 0 &&
      form.login.trim().length > 0 &&
      (!isCreate || form.password.length >= 12) &&
      (!loginChanged || form.confirmLoginChange);
  const dialogRef = useRef<HTMLElement>(null);
  const close = () => {
    if (!saving) onClose();
  };
  useModalAccessibility(dialogRef, close);
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-dialog-title"
        aria-busy={saving}
        tabIndex={-1}
        className="w-full max-w-lg rounded-md border border-line bg-surface shadow-2xl outline-none bo-modal-card"
      >
        <div className="flex items-center justify-between border-b border-line bg-field px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-brand">
              ПОЛЬЗОВАТЕЛИ
            </p>
            <h2 id="user-dialog-title" className="mt-1 text-xl font-semibold text-copy">
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={close}
            data-tooltip="Закрыть"
            aria-label="Закрыть"
            className="bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-brand disabled:opacity-40"
          >
            <IconX className="size-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {isPassword ? (
            <PasswordField value={form.password} onChange={(value) => set("password", value)} />
          ) : (
            <>
              <Field label="Имя">
                <input
                  data-modal-initial-focus
                  autoFocus
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  maxLength={100}
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm"
                />
              </Field>
              <Field label="Логин для входа">
                <input
                  value={form.login}
                  onChange={(event) => {
                    set("login", event.target.value);
                    set("confirmLoginChange", false);
                  }}
                  maxLength={50}
                  pattern="[A-Za-z0-9._-]+"
                  autoComplete="username"
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm"
                />
              </Field>
              {editor.mode === "edit" && loginChanged && (
                <div className="flex gap-3 rounded-md border border-brand/40 bg-brand-soft/40 px-3 py-2.5 text-sm text-copy">
                  <Checkbox
                    ariaLabel="Подтвердить смену логина"
                    checked={form.confirmLoginChange}
                    onCheckedChange={(checked) => set("confirmLoginChange", checked)}
                  />
                  <p>
                    Подтверждаю смену логина. Войти как «{editor.user.login}» будет нельзя —
                    сообщите сотруднику новый логин.
                  </p>
                </div>
              )}
              {isCreate && (
                <PasswordField value={form.password} onChange={(value) => set("password", value)} />
              )}
              <Field label="Роль">
                <CustomSelect
                  value={form.role}
                  onChange={(value) => set("role", value as UserForm["role"])}
                  options={roleOptions}
                  ariaLabel="Роль пользователя"
                />
              </Field>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-field px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={close}
            className="h-10 px-4 text-sm text-copy-muted hover:text-copy disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={onSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconUserPlus className="size-4" />
            {saving
              ? "Сохранение…"
              : isPassword
                ? "Сменить пароль"
                : isCreate
                  ? "Добавить"
                  : "Сохранить"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SessionsModal({
  user,
  onClose,
  onChanged,
}: {
  user: ManagedUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirmation();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await getUserSessions(user.id));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError ? cause.message : "Не удалось загрузить сессии.",
      );
    } finally {
      setLoading(false);
    }
  }, [user.id]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const dialogRef = useRef<HTMLElement>(null);
  useModalAccessibility(dialogRef, onClose);
  const revoke = async (session: UserSession) => {
    if (
      !(await confirm({
        title: "Завершить эту сессию?",
        description: "Пользователь будет разлогинен на этом устройстве.",
        confirmLabel: "Завершить сессию",
        tone: "primary",
      }))
    )
      return;
    try {
      await revokeUserSession(user.id, session.id);
      notify("Сессия завершена");
      await load();
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof BackofficeApiError ? cause.message : "Не удалось завершить сессию.",
      );
    }
  };
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sessions-dialog-title"
        aria-busy={loading}
        tabIndex={-1}
        className="w-full max-w-2xl overflow-hidden rounded-md border border-line bg-surface shadow-2xl outline-none bo-modal-card"
      >
        <div className="flex items-center justify-between border-b border-line bg-field px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-brand">
              АКТИВНЫЕ СЕССИИ
            </p>
            <h2 id="sessions-dialog-title" className="mt-1 text-xl font-semibold text-copy">
              {user.name}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-modal-initial-focus
              data-tooltip="Обновить"
              aria-label="Обновить"
              onClick={() => void load()}
              className="bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-brand"
            >
              <IconRefresh className={"size-4 " + (loading ? "animate-spin" : "")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              data-tooltip="Закрыть"
              aria-label="Закрыть"
              className="bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-brand"
            >
              <IconX className="size-5" />
            </button>
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
        <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} onRevoke={() => void revoke(session)} />
          ))}
          {!loading && !sessions.length && (
            <div className="px-5 py-12 text-center text-sm text-copy-muted">
              Активных сессий нет.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SessionRow({ session, onRevoke }: { session: UserSession; onRevoke: () => void }) {
  const application =
    session.application === "CRM"
      ? "CRM"
      : session.application === "BACKOFFICE"
        ? "Back office"
        : "Неизвестный интерфейс";
  const format = (date: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="font-medium text-copy">{application}</p>
        <p className="mt-1 text-xs text-copy-muted">Создана: {format(session.createdAt)}</p>
        <p className="mt-1 text-xs text-copy-faint">Истекает: {format(session.expiresAt)}</p>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-xs text-copy-muted hover:border-brand hover:text-brand"
      >
        <IconLogout2 className="size-4" />
        Завершить
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-copy-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-copy-faint">{hint}</span>}
    </label>
  );
}
function PasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field
      label="Пароль"
      hint="Не менее 12 символов. После смены пароля все активные сессии будут завершены."
    >
      <input
        data-modal-initial-focus
        autoFocus
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm"
      />
    </Field>
  );
}
function notify(message: string) {
  window.dispatchEvent(new CustomEvent("backoffice:notice", { detail: message }));
}
