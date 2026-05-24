import { assertEquals, assertStringIncludes } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { join } from "@std/path";
import { runCommand } from "./command-runner.ts";
import { createDenoFsResourceStore } from "../storage/deno-fs-resource-store.ts";

Deno.test("runCommand lists resources through a ResourceStore", async () => {
  await using root = await createTempDir();
  await Deno.writeTextFile(join(root.path, "file.txt"), "Hello");
  const response = await runCommand(
    { type: "list", path: { pathname: "/" }, depth: 1 },
    { store: createDenoFsResourceStore(root.path) },
  );

  assertEquals(response.type, "multistatus");
  if (response.type === "multistatus") {
    assertEquals(response.resources.map((resource) => resource.href), ["/", "/file.txt"]);
  }
});

Deno.test("runCommand reads resources through a ResourceStore", async () => {
  await using root = await createTempDir();
  await Deno.writeTextFile(join(root.path, "file.txt"), "Hello");
  const response = await runCommand(
    { type: "read", path: { pathname: "/file.txt" } },
    { store: createDenoFsResourceStore(root.path) },
  );

  assertEquals(response.type, "body");
  assertEquals(response.status, 200);
  assertEquals(response.headers, { "Content-Type": "application/octet-stream" });
  if (response.type === "body") {
    assertEquals(await new Response(response.body).text(), "Hello");
  }
});

Deno.test("runCommand preserves unknown method response contract", async () => {
  await using root = await createTempDir();
  const response = await runCommand(
    { type: "unknown", method: "UNKNOWN", path: { pathname: "/file.txt" } },
    { store: createDenoFsResourceStore(root.path) },
  );

  assertEquals(response.type, "body");
  assertEquals(response.status, 405);
  assertEquals(response.statusText, "Method Not Allowed");
  assertEquals(response.headers, { "Content-Type": "text/plain" });
  if (response.type === "body") {
    assertStringIncludes(`${response.body}`, "Unknown method: UNKNOWN");
  }
});
