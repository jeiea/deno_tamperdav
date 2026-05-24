import { assertEquals, assertStringIncludes } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { join } from "@std/path";
import { findDependentUserscripts, rewriteUserscriptDependencyUrls } from "./dependencies.ts";

Deno.test("rewriteUserscriptDependencyUrls rewrites relative require and resource URLs", async () => {
  await using root = await createTempDir();
  await Deno.mkdir(join(root.path, "scripts", "assets"), { recursive: true });
  await Deno.writeTextFile(join(root.path, "scripts", "lib.js"), "export {}");
  await Deno.writeTextFile(join(root.path, "scripts", "assets", "style.css"), "");
  const libStat = await Deno.stat(join(root.path, "scripts", "lib.js"));
  const styleStat = await Deno.stat(join(root.path, "scripts", "assets", "style.css"));

  const rewritten = await rewriteUserscriptDependencyUrls(
    [
      "// ==UserScript==",
      "// @name Demo",
      "// @require ./lib.js?v=keep&tdv=old#ready",
      "// @resource style assets/style.css",
      "// @require https://cdn.example.test/lib.js",
      "// ==/UserScript==",
      "console.log('demo');",
    ].join("\n"),
    {
      root: root.path,
      scriptPathname: "/scripts/demo.user.js",
      origin: "http://localhost:7000",
    },
  );

  assertStringIncludes(
    rewritten,
    `// @require http://localhost:7000/scripts/lib.js?v=keep&tdv=${
      libStat.mtime?.getTime() ?? 0
    }#ready`,
  );
  assertStringIncludes(
    rewritten,
    `// @resource style http://localhost:7000/scripts/assets/style.css?tdv=${
      styleStat.mtime?.getTime() ?? 0
    }`,
  );
  assertStringIncludes(rewritten, "// @require https://cdn.example.test/lib.js");
});

Deno.test("rewriteUserscriptDependencyUrls rewrites missing relative dependencies", async () => {
  await using root = await createTempDir();

  const rewritten = await rewriteUserscriptDependencyUrls(
    [
      "// ==UserScript==",
      "// @require ./missing.js?x=1",
      "// ==/UserScript==",
    ].join("\n"),
    {
      root: root.path,
      scriptPathname: "/demo.user.js",
      origin: "http://localhost:7000",
    },
  );

  assertStringIncludes(rewritten, "// @require http://localhost:7000/missing.js?x=1&tdv=0");
});

Deno.test("findDependentUserscripts returns scripts that reference changed dependencies", async () => {
  await using root = await createTempDir();
  await Deno.mkdir(join(root.path, "scripts"), { recursive: true });
  await Deno.writeTextFile(
    join(root.path, "scripts", "demo.user.js"),
    [
      "// ==UserScript==",
      "// @require ../lib.js",
      "// @resource style ./style.css",
      "// ==/UserScript==",
    ].join("\n"),
  );
  await Deno.writeTextFile(
    join(root.path, "scripts", "external.user.js"),
    [
      "// ==UserScript==",
      "// @require https://cdn.example.test/lib.js",
      "// ==/UserScript==",
    ].join("\n"),
  );

  const dependents = await findDependentUserscripts({
    root: root.path,
    changedPaths: ["lib.js", "other.js"],
  });

  assertEquals(dependents, new Set(["scripts/demo.user.js"]));
});
