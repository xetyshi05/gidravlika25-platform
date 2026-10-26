import { PageHeading } from "@/components/page-heading";
import { RequestReadMarker } from "@/components/request-read-marker";
import { RequestDetailsView } from "@/components/request-details";
import { ApiError, getRequest } from "@/lib/requests";
import type { RequestHistoryPages } from "@/types/requests";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const historyPages: RequestHistoryPages = {
    commentsPage: positivePage(query.commentsPage),
    activitiesPage: positivePage(query.activitiesPage),
    consentsPage: positivePage(query.consentsPage),
  };
  const result = await getRequest(id, historyPages)
    .then((request) => ({ request }))
    .catch((error: unknown) => ({
      message:
        error instanceof ApiError && error.status === 404
          ? "Заявка не найдена"
          : "Не удалось загрузить данные",
    }));

  return "request" in result ? (
    <>
      <RequestReadMarker requestId={result.request.id} />
      <RequestDetailsView
        request={result.request}
        historyPages={historyPages}
        openPersonalData={query.personalData === "open"}
      />
    </>
  ) : (
    <main className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <PageHeading eyebrow="CRM / Заявки" title={result.message} />
      <div className="mt-8 border-l-2 border-brand bg-white p-5 text-sm text-slate-700">
        Попробуйте вернуться к списку заявок и повторить запрос.
      </div>
    </main>
  );
}

function positivePage(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
