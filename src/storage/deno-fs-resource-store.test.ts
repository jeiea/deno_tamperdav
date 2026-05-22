import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createDenoFsResourceStore } from "./deno-fs-resource-store.ts";

Deno.test("DenoFsResourceStore lists resources under a path", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(root, "dir"));
    await Deno.writeTextFile(join(root, "dir", "file.txt"), "Hello");
    const store = createDenoFsResourceStore(root);

    const resources = await store.list({ pathname: "/dir" }, { recursive: false });

    assertEquals(resources.map((resource) => resource.href), ["/dir"]);
    assertEquals(resources[0]?.isCollection, true);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("DenoFsResourceStore writes and reads resources", async () => {
  const root = await Deno.makeTempDir();
  try {
    const store = createDenoFsResourceStore(root);

    await store.write({
      path: { pathname: "/file.txt" },
      body: new Blob(["Hello"]).stream(),
      mtimeSeconds: 1700000000,
      signal: new AbortController().signal,
    });
    const read = await store.read({ pathname: "/file.txt" });
    const stat = await Deno.stat(join(root, "file.txt"));

    assertEquals(await new Response(read.body).text(), "Hello");
    assertEquals(Math.floor((stat.mtime?.getTime() ?? 0) / 1000), 1700000000);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
