import { assertEquals } from "@std/assert";
import { filterChangedPaths } from "./change-filter.ts";

Deno.test("filterChangedPaths returns direct and child changes", () => {
  assertEquals(
    filterChangedPaths({
      requestedPath: "Tampermonkey/sync",
      changedPaths: [
        "Tampermonkey/sync",
        "Tampermonkey/sync/script.user.js",
        "Tampermonkey/sync-not-equal/script.user.js",
      ],
    }),
    new Set(["Tampermonkey/sync", "Tampermonkey/sync/script.user.js"]),
  );
});

Deno.test("filterChangedPaths returns all changes for root subscription", () => {
  assertEquals(
    filterChangedPaths({
      requestedPath: ".",
      changedPaths: ["script.user.js", "Tampermonkey/sync/script.user.js"],
    }),
    new Set(["script.user.js", "Tampermonkey/sync/script.user.js"]),
  );
});
