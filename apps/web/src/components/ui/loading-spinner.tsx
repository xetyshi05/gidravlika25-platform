type LoadingSpinnerProps = {
  label?: string;
  className?: string;
};

export function LoadingSpinner({ label = "Загрузка", className = "" }: LoadingSpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center justify-center ${className}`}>
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
