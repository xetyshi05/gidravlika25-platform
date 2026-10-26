import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { BACKOFFICE_CSRF_COOKIE } from "@/lib/csrf-protection";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  if (!cookieStore.has("backoffice_session")) {
    return Response.json({ message: "Требуется авторизация." }, { status: 401 });
  }

  const currentToken = cookieStore.get(BACKOFFICE_CSRF_COOKIE)?.value;
  const token = currentToken || randomBytes(32).toString("base64url");
  if (!currentToken) {
    cookieStore.set(BACKOFFICE_CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/api/backoffice",
      maxAge: 60 * 60 * 8,
    });
  }

  return Response.json(
    { token },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
