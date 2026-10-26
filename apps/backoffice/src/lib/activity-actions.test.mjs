import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { activityActions } from "./activity-actions.ts";

test("offers exactly the actions that the API records", () => {
  const source = readFileSync(
    new URL("../../../api/src/backoffice/backoffice-activity.service.ts", import.meta.url),
    "utf8",
  );
  const list = source.slice(source.indexOf("actionsByScope = {"), source.indexOf("} as const"));
  const apiActions = [...list.matchAll(/'([A-Z_]+)'/g)].map(([, action]) => action).sort();

  assert.deepEqual(activityActions.map((action) => action.value).sort(), apiActions);
});
