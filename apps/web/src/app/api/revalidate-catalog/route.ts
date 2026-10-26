import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const expectedSecret = process.env.CATALOG_REVALIDATION_SECRET;
  if (!expectedSecret) {
    return Response.json({ message: "Catalog revalidation is not configured." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!equalSecrets(providedSecret, expectedSecret)) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }

  // Called by the API after a Back Office change: never serve the stale catalog to the next visitor.
  revalidateTag("catalog", { expire: 0 });
  return Response.json({ revalidated: true });
}

function equalSecrets(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
