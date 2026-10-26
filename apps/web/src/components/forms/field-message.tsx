type FieldMessageProps = {
  id?: string;
  message?: string;
  tone?: "error" | "hint";
  reserveMessage?: string;
};

export function FieldMessage({ id, message, tone = "error", reserveMessage }: FieldMessageProps) {
  return (
    <span
      id={id}
      role={message ? (tone === "error" ? "alert" : "status") : undefined}
      aria-hidden={!message || undefined}
      className={`relative block min-h-4 text-xs font-medium leading-4 ${tone === "error" ? "text-brand" : "text-slate-500"}`}
    >
      <span aria-hidden="true" className="invisible block">
        {reserveMessage ?? "\u00a0"}
      </span>
      <span className="absolute inset-x-0 top-0">{message}</span>
    </span>
  );
}
