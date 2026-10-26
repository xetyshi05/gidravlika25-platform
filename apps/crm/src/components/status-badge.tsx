import { requestStatusLabels, type RequestStatus } from "@/types/requests";

const statusClassNames: Record<RequestStatus, string> = {
  NEW: "border-brand bg-red-50 text-brand",
  IN_PROGRESS: "border-amber-300 bg-amber-50 text-amber-800",
  CONTACTED: "border-sky-300 bg-sky-50 text-sky-800",
  COMPLETED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  CANCELLED: "border-slate-300 bg-slate-50 text-slate-600",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-flex border px-2 py-1 text-xs font-bold ${statusClassNames[status]}`}>
      {requestStatusLabels[status]}
    </span>
  );
}
