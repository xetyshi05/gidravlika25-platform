import { cookies } from "next/headers";
import { callApi, type ApiSchemas } from "@/lib/api";

export type CurrentUser = ApiSchemas["CurrentUser"];

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get("crm_session")?.value;
  if (!token) return null;
  try {
    return await callApi((api, options) =>
      api.GET("/auth/me", {
        ...options,
        params: { header: { authorization: `Bearer ${token}`, "x-application": "CRM" } },
      }),
    );
  } catch {
    return null;
  }
}
