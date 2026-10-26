import { MediaManager } from "@/components/media-manager";
import { PageHeader } from "@/components/ui";

export default function MediaPage() {
  return (
    <main>
      <PageHeader eyebrow="САЙТ" title="Медиафайлы" />
      <div className="px-5 py-6 sm:px-8 lg:px-10">
        <MediaManager />
      </div>
    </main>
  );
}
