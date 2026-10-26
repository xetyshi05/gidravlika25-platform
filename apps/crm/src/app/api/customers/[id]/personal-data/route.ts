import { callApi } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const data = await callApi((api, options) =>
      api.GET("/customers/{id}/personal-data", { ...options, params: { path: { id } } }),
    );
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="customer-${safeFilePart(id)}-personal-data.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message =
      status === 403
        ? "Экспорт персональных данных доступен только администратору."
        : status === 404
          ? "Клиент не найден."
          : "Не удалось подготовить экспорт персональных данных.";
    return Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

function safeFilePart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "unknown";
}
