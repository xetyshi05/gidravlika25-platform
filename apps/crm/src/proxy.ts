import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  if (publicPaths.some((path) => request.nextUrl.pathname.startsWith(path)))
    return NextResponse.next();
  if (request.cookies.has("crm_session")) return NextResponse.next();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ["/((?!_next|favicon.ico|icon.png|logo_text.png).*)"] };
