import { NextResponse, type NextRequest } from "next/server";
export function proxy(r: NextRequest) {
  if (r.nextUrl.pathname.startsWith("/login")) return NextResponse.next();
  if (r.cookies.has("backoffice_session")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", r.url));
}
export const config = { matcher: ["/((?!_next|favicon.ico|icon.png|logo_text.png).*)"] };
