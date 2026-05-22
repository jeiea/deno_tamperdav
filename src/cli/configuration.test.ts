import { assertEquals } from "@std/assert";
import { parseCliArgs, resolveCliCommand } from "./configuration.ts";

Deno.test("CLI configuration resolves serve options from CLI, config, and env", () => {
  const cliArgs = parseCliArgs([
    "--debug",
    "--host=0.0.0.0",
    "--port=8123",
    "--username=cli-user",
    "--path=dav",
  ]);

  const command = resolveCliCommand({
    cliArgs,
    fileConfig: {
      password: "config-password",
      username: "config-user",
      path: "config-dav",
      port: 7000,
      "meta-touch": true,
    },
    env: {
      TD_USERNAME: "env-user",
      TD_PASSWORD: "env-password",
    },
  });

  assertEquals(command, {
    type: "serve",
    root: "dav",
    host: "0.0.0.0",
    port: 8123,
    warnUnauthenticated: false,
    args: {
      // TODO: confirm whether config booleans should be able to override parseArgs defaults.
      "meta-touch": false,
      "no-auth-warning": false,
      _: [],
      debug: true,
      help: false,
      host: "0.0.0.0",
      password: "config-password",
      path: "dav",
      port: "8123",
      username: "cli-user",
    },
  });
});

Deno.test("CLI configuration fills credentials from env after config", () => {
  const command = resolveCliCommand({
    cliArgs: parseCliArgs(["--path=dav"]),
    fileConfig: {},
    env: {
      TD_USERNAME: "env-user",
      TD_PASSWORD: "env-password",
    },
  });

  assertEquals(command.type, "serve");
  if (command.type !== "serve") {
    return;
  }
  assertEquals(command.args.username, "env-user");
  assertEquals(command.args.password, "env-password");
  assertEquals(command.warnUnauthenticated, false);
});

Deno.test("CLI configuration reports help without requiring path", () => {
  const command = resolveCliCommand({
    cliArgs: parseCliArgs(["--help"]),
    fileConfig: {},
    env: {},
  });

  assertEquals(command.type, "help");
});

Deno.test("CLI configuration reports missing path as an exit command", () => {
  const command = resolveCliCommand({
    cliArgs: parseCliArgs(["--no-auth-warning"]),
    fileConfig: {},
    env: {},
  });

  assertEquals(command, {
    type: "exit",
    code: 1,
    stderr: "path arguments missing",
  });
});
