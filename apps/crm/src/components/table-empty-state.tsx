import { IconInbox } from "@tabler/icons-react";

export function TableEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 px-5 py-10 text-center">
      <IconInbox className="mx-auto size-8 text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-bold text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
