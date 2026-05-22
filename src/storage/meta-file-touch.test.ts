import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { touchMetaFiles } from "./meta-file-touch.ts";

Deno.test("touchMetaFiles ignores missing meta files", async () => {
  const root = await Deno.makeTempDir();
  try {
    const touched = await touchMetaFiles(["script.user.js"], { root, date: new Date() });

    assertEquals(touched, []);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("touchMetaFiles reports non-missing file system errors", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(root, "script.user.js"), "");

    await assertRejects(
      () => touchMetaFiles(["script.user.js\0"], { root, date: new Date() }),
      TypeError,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
