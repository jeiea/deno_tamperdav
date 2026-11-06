import { assertEquals, assertThrows } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { exists } from "@std/fs/exists";
import { join } from "@std/path";
import { isMetadataRemoved, reconcileStartupScripts } from "./startup-reconcile.ts";

Deno.test("Malformed metadata cannot be interpreted as an active script", () => {
  for (const content of ["not JSON", "null", "[]", '{"options":[]}']) {
    assertThrows(() => isMetadataRemoved(content), Error, undefined, content);
  }
});

Deno.test("Metadata deletion accepts timestamps and preserves inactive markers", () => {
  for (const removed of [true, 1793984156136, "deleted"]) {
    assertEquals(isMetadataRemoved(JSON.stringify({ options: { removed } })), true);
  }
  for (const removed of [undefined, false, 0, "", null]) {
    assertEquals(isMetadataRemoved(JSON.stringify({ options: { removed } })), false);
  }
  assertEquals(isMetadataRemoved("{}"), false);
});

for (
  const [scenario, removed] of [
    ["preserves active", false],
    ["deletes removed", 1793984156136],
  ] as const
) {
  Deno.test(`Startup ${scenario} pairs using filesystem case sensitivity`, async () => {
    await using root = await createTempDir();
    const sync = join(root.path, "Tampermonkey", "sync");
    await Deno.mkdir(sync, { recursive: true });
    const uuid = "e673c081-401b-49fb-af38-f219710280c7";
    const scriptPath = join(sync, `${uuid.toUpperCase()}.user.js`);
    const metaPath = join(sync, `${uuid}.meta.json`);
    const script = "// ==UserScript==\n// @name Script\n// ==/UserScript==";
    const metadata = JSON.stringify({ uuid, name: "Original name", options: { removed } });
    await Deno.writeTextFile(scriptPath, script);
    await Deno.writeTextFile(metaPath, metadata);
    const sameFile = await exists(join(sync, `${uuid}.user.js`));

    for (let attempt = 0; attempt < 2; attempt++) {
      await reconcileStartupScripts(root.path);

      assertEquals(await exists(scriptPath), !(sameFile && removed));
      assertEquals(await exists(metaPath), !removed);
      if (!removed) assertEquals(await Deno.readTextFile(metaPath), metadata);
      if (!sameFile) {
        assertEquals(await Deno.readTextFile(scriptPath), script);
        const generated = JSON.parse(
          await Deno.readTextFile(join(sync, `${uuid.toUpperCase()}.meta.json`)),
        );
        assertEquals(generated.uuid, uuid.toUpperCase());
        assertEquals(generated.name, "Script");
      }
    }
  });
}
