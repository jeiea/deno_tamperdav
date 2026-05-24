import { assertEquals, assertRejects } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { join } from "@std/path";
import { touchMetaFiles } from "./meta-file-touch.ts";

Deno.test("touchMetaFiles ignores missing meta files", async () => {
  await using root = await createTempDir();

  const touched = await touchMetaFiles(["script.user.js"], { root: root.path, date: new Date() });

  assertEquals(touched, []);
});

Deno.test("touchMetaFiles reports non-missing file system errors", async () => {
  await using root = await createTempDir();
  await Deno.writeTextFile(join(root.path, "script.user.js"), "");

  await assertRejects(
    () => touchMetaFiles(["script.user.js\0"], { root: root.path, date: new Date() }),
    TypeError,
  );
});
