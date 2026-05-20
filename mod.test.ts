import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("CLI help prints usage and exits successfully", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "mod.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  assertEquals(output.code, 0);
  assertStringIncludes(new TextDecoder().decode(output.stdout), "Starts a WebDAV server");
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
