"use client";

import { PageHeader } from "@/components/ui";
import { ActivityJournal } from "@/components/activity-journal";

export default function ActivityLogPage() {
  return (
    <main>
      <PageHeader eyebrow="СИСТЕМА" title="Журнал действий" />
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:px-10">
        <ActivityJournal />
      </div>
    </main>
  );
}
