import { assertEquals, assertStringIncludes } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { deadline } from "@std/async/deadline";
import { exists } from "@std/fs/exists";
import { dirname, join } from "@std/path";
import { spawnCli } from "./test/setup-cli.ts";

Deno.test("CLI help prints usage and exits successfully", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "mod.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  assertEquals(output.code, 0);
  const stdout = new TextDecoder().decode(output.stdout);
  assertStringIncludes(stdout, "Starts a WebDAV server");
  assertStringIncludes(stdout, "Updates corresponding meta file");
  assertStringIncludes(stdout, "--log-level");
  assertStringIncludes(stdout, "Enables debug logs");
  assertStringIncludes(stdout, "The editor to use when pressing the cloud editor icon");
  assertStringIncludes(stdout, "TD_PATH");
  assertStringIncludes(stdout, "TD_LOG_LEVEL");
  assertStringIncludes(stdout, "TD_OPEN_IN_EDITOR");
  assertStringIncludes(stdout, "--no-startup-reconcile");
  assertStringIncludes(stdout, "TD_NO_STARTUP_RECONCILE");
  assertStringIncludes(stdout, "Command line options have precedence over environment variables");
  assertEquals(new TextDecoder().decode(output.stderr), "");
});

Deno.test("CLI reconciles scripts before serving and preserves them on restart", async () => {
  await using root = await createTempDir();
  const sync = join(root.path, "Tampermonkey", "sync");
  await Deno.mkdir(sync, { recursive: true });
  const uuid = "e673c081-401b-49fb-af38-f219710280c7";
  const script = "// ==UserScript==\n// @name Shared name\n// ==/UserScript==\n";
  await Deno.writeTextFile(join(sync, `${uuid}.user.js`), script);
  await Deno.utime(join(sync, `${uuid}.user.js`), 1700000000, 1700000000);
  const preserved = {
    "existing.user.js": script,
    "existing.meta.json": '{"uuid":"existing","name":"Shared name","options":{}}\n',
    "orphan.meta.json": '{"uuid":"orphan","options":{"removed":false}}',
    "zero.meta.json": '{"uuid":"zero","options":{"removed":0}}',
    "outside.js": "untouched",
  };
  for (const [name, content] of Object.entries(preserved)) {
    await Deno.writeTextFile(join(sync, name), content);
  }
  await Deno.writeTextFile(join(sync, "removed.user.js"), script);
  await Deno.writeTextFile(
    join(sync, "removed.meta.json"),
    JSON.stringify({ uuid: "../../outside", options: { removed: 1793984156136 } }),
  );
  await Deno.writeTextFile(
    join(sync, "removed-orphan.meta.json"),
    JSON.stringify({ options: { removed: 1793983904372 } }),
  );
  await Deno.writeTextFile(join(root.path, "outside.user.js"), script);
  await Deno.mkdir(join(sync, "nested"));
  await Deno.writeTextFile(join(sync, "nested", "ignored.user.js"), script);

  for (let attempt = 0; attempt < 2; attempt++) {
    await using cli = spawnCli(root.path);
    await cli.waitForListening();

    const response = await fetch(`${cli.origin}/Tampermonkey/sync/${uuid}.meta.json`);
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      uuid,
      name: "Shared name",
      options: {},
      lastModified: 1700000000000,
    });
    assertEquals(await Deno.readTextFile(join(sync, `${uuid}.user.js`)), script);
    for (const [name, content] of Object.entries(preserved)) {
      assertEquals(await Deno.readTextFile(join(sync, name)), content);
    }
    for (const name of ["removed.user.js", "removed.meta.json", "removed-orphan.meta.json"]) {
      assertEquals(await exists(join(sync, name)), false, name);
    }
    assertEquals(await Deno.readTextFile(join(root.path, "outside.user.js")), script);
    assertEquals(await exists(join(sync, "nested", "ignored.meta.json")), false);
  }
});

Deno.test("CLI starts without creating an absent sync directory", async () => {
  await using root = await createTempDir();
  await using cli = spawnCli(root.path);
  await cli.waitForListening();
  assertEquals(await exists(join(root.path, "Tampermonkey")), false);
});

Deno.test("CLI opt-out preserves files through both flag and environment", async (test) => {
  for (
    const options of [
      { args: ["--no-startup-reconcile"], env: { TD_NO_STARTUP_RECONCILE: "false" } },
      { env: { TD_NO_STARTUP_RECONCILE: "true" } },
    ]
  ) {
    await test.step(options.args ? "flag overrides environment" : "environment", async () => {
      await using root = await createTempDir();
      const sync = join(root.path, "Tampermonkey", "sync");
      await Deno.mkdir(sync, { recursive: true });
      const files = {
        "new.user.js": "// ==UserScript==\n// @name New\n// ==/UserScript==",
        "removed.user.js": "deleted script",
        "removed.meta.json": '{"options":{"removed":1781722036673}}',
        "corrupt.meta.json": "not JSON",
      };
      for (const [name, content] of Object.entries(files)) {
        await Deno.writeTextFile(join(sync, name), content);
      }

      await using cli = spawnCli(root.path, options);
      await cli.waitForListening();

      assertEquals(await exists(join(sync, "new.meta.json")), false);
      for (const [name, content] of Object.entries(files)) {
        assertEquals(await Deno.readTextFile(join(sync, name)), content);
      }
    });
  }
});

Deno.test("CLI environment false keeps startup reconciliation enabled", async () => {
  await using root = await createTempDir();
  const sync = join(root.path, "Tampermonkey", "sync");
  await Deno.mkdir(sync, { recursive: true });
  await Deno.writeTextFile(join(sync, "removed.meta.json"), '{"options":{"removed":true}}');

  await using cli = spawnCli(root.path, { env: { TD_NO_STARTUP_RECONCILE: "false" } });
  await cli.waitForListening();

  assertEquals(await exists(join(sync, "removed.meta.json")), false);
});

Deno.test("CLI stops with a file diagnostic when sync metadata is corrupt", async () => {
  await using root = await createTempDir();
  const sync = join(root.path, "Tampermonkey", "sync");
  await Deno.mkdir(sync, { recursive: true });
  const content = "not JSON";
  await Deno.writeTextFile(join(sync, "corrupt.meta.json"), content);

  await using cli = spawnCli(root.path);
  const output = await deadline(cli.output, 10000);

  assertEquals(output.success, false);
  assertStringIncludes(output.stderr, "corrupt.meta.json");
  assertEquals(output.stdout.includes("server is listening"), false);
  assertEquals(await Deno.readTextFile(join(sync, "corrupt.meta.json")), content);
});

Deno.test("CLI leaves an unnamed script intact and reports why startup stopped", async () => {
  await using root = await createTempDir();
  const sync = join(root.path, "Tampermonkey", "sync");
  await Deno.mkdir(sync, { recursive: true });
  const script = "// ==UserScript==\n// @version 1\n// ==/UserScript==";
  await Deno.writeTextFile(join(sync, "unnamed.user.js"), script);

  await using cli = spawnCli(root.path);
  const output = await deadline(cli.output, 10000);

  assertEquals(output.success, false);
  assertStringIncludes(output.stderr, "unnamed.user.js");
  assertStringIncludes(output.stderr, "@name");
  assertEquals(await exists(join(sync, "unnamed.meta.json")), false);
  assertEquals(await Deno.readTextFile(join(sync, "unnamed.user.js")), script);
});

Deno.test("CLI rejects sync links without changing their targets", async (test) => {
  for (
    const path of [
      "Tampermonkey",
      "Tampermonkey/sync",
      "Tampermonkey/sync/linked.user.js",
      "Tampermonkey/sync/linked.meta.json",
    ]
  ) {
    await test.step(path, async () => {
      await using root = await createTempDir();
      await using outside = await createTempDir();
      const link = join(root.path, path);
      await Deno.mkdir(dirname(link), { recursive: true });
      await Deno.symlink(outside.path, link, { type: "junction" });
      const content = '{"options":{"removed":true}}';
      await Deno.writeTextFile(join(outside.path, "removed.meta.json"), content);

      await using cli = spawnCli(root.path);
      const output = await deadline(cli.output, 10000);

      assertEquals(output.success, false);
      assertStringIncludes(output.stderr, link);
      assertEquals(await Deno.readTextFile(join(outside.path, "removed.meta.json")), content);
    });
  }
});

Deno.test("CLI without path exits with an error", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "mod.ts", "--no-auth-warning"],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  assertEquals(output.code, 1);
  assertEquals(new TextDecoder().decode(output.stdout), "");
  assertStringIncludes(new TextDecoder().decode(output.stderr), "path arguments missing");
});
