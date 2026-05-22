import { assertEquals, assertStringIncludes } from "@std/assert";

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
  assertStringIncludes(stdout, "Provides some more detailed output");
  assertStringIncludes(stdout, "The editor to use when pressing the cloud editor icon");
  assertStringIncludes(stdout, "TD_PATH");
  assertStringIncludes(stdout, "TD_OPEN_IN_EDITOR");
  assertStringIncludes(stdout, "Command line options have precedence over environment variables");
  assertEquals(new TextDecoder().decode(output.stderr), "");
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
