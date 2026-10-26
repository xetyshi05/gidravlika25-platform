"use client";

import { useEffect } from "react";
import { markRequestRead } from "@/app/requests/[id]/actions";

export function RequestReadMarker({ requestId }: { requestId: string }) {
  useEffect(() => {
    void markRequestRead(requestId);
  }, [requestId]);

  return null;
}
