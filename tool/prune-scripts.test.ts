import { assertEquals } from "@std/assert";
import { createTempDir, type TempDir } from "@jeiea/snippets";
import { copy } from "@std/fs";
import { basename, join, resolve } from "@std/path";
import { pruneScripts } from "./prune-scripts.ts";

Deno.test("Given empty directory", async (test) => {
  await using clone = await createTempDir();

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should be empty", async () => {
      assertEquals(await snapshotDirectory(clone.path), []);
    });
  });
});

Deno.test("Given directory containing directory", async (test) => {
  await using original = await createTempDir();
  await Deno.mkdir(join(original.path, "test"));
  await using clone = await cloneDirectory(original.path);

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should be empty", async () => {
      await assertDirectoryEquals(clone.path, original.path);
    });
  });
});

Deno.test("Given alive meta.json", async (test) => {
  const template = resolve("./test/data/normal-meta");
  await using clone = await cloneDirectory(template);

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should preserve all", async () => {
      await assertDirectoryEquals(clone.path, template);
    });
  });
});

Deno.test("Given removed meta.json", async (test) => {
  const template = resolve("./test/data/removed-meta");
  await using clone = await cloneDirectory(template);

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should remove all", async () => {
      assertEquals(await snapshotDirectory(clone.path), []);
    });
  });
});

Deno.test("Given removed orphan meta.json", async (test) => {
  const template = resolve("./test/data/removed-orphan-meta");
  await using clone = await cloneDirectory(template);

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should remove it", async () => {
      assertEquals(await snapshotDirectory(clone.path), []);
    });
  });
});

Deno.test("Given orphan meta.json", async (test) => {
  const template = resolve("./test/data/orphan-meta");
  await using clone = await cloneDirectory(template);

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should remove it", async () => {
      assertEquals(await snapshotDirectory(clone.path), []);
    });
  });
});

Deno.test("Given orphan user.js", async (test) => {
  const template = resolve("./test/data/orphan-js");
  await using clone = await cloneDirectory(template);

  await test.step("when prune", async (test) => {
    await pruneScripts(clone.path);

    await test.step("it should remove it", async () => {
      assertEquals(await snapshotDirectory(clone.path), []);
    });
  });
});

async function cloneDirectory(original: string): Promise<TempDir> {
  const directory = await createTempDir({
    dir: resolve("./test/tmp"),
    prefix: basename(original),
  });
  await copy(original, directory.path, { overwrite: true });
  return directory;
}

async function assertDirectoryEquals(actual: string, expected: string) {
  const [actualFiles, expectedFiles] = await Promise.all([
    snapshotDirectory(actual),
    snapshotDirectory(expected),
  ]);
  assertEquals(actualFiles, expectedFiles);
}

async function snapshotDirectory(actual: string) {
  const entries = await Array.fromAsync(Deno.readDir(actual));

  return await Promise.all(entries.flatMap(async (item) => {
    if (!item.isFile) {
      return [];
    }
    const content = await Deno.readFile(join(actual, item.name));
    return { item, content };
  }));
}
