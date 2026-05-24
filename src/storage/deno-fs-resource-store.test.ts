import { assertEquals } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { join } from "@std/path";
import { createDenoFsResourceStore } from "./deno-fs-resource-store.ts";

Deno.test("DenoFsResourceStore lists resources under a path", async () => {
  await using root = await createTempDir();
  await Deno.mkdir(join(root.path, "dir"));
  await Deno.writeTextFile(join(root.path, "dir", "file.txt"), "Hello");
  const store = createDenoFsResourceStore(root.path);

  const resources = await store.list({ pathname: "/dir" }, { recursive: false });

  assertEquals(resources.map((resource) => resource.href), ["/dir"]);
  assertEquals(resources[0]?.isCollection, true);
});

Deno.test("DenoFsResourceStore writes and reads resources", async () => {
  await using root = await createTempDir();
  const store = createDenoFsResourceStore(root.path);

  await store.write({
    path: { pathname: "/file.txt" },
    body: new Blob(["Hello"]).stream(),
    mtimeSeconds: 1700000000,
    signal: new AbortController().signal,
  });
  const read = await store.read({ pathname: "/file.txt" });
  const stat = await Deno.stat(join(root.path, "file.txt"));

  assertEquals(await new Response(read.body).text(), "Hello");
  assertEquals(Math.floor((stat.mtime?.getTime() ?? 0) / 1000), 1700000000);
});
