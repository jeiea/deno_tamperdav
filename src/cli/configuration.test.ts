import { assertEquals } from "@std/assert";
import { parseCliArgs, resolveCliCommand } from "./configuration.ts";

Deno.test("CLI configuration resolves serve options from CLI and env", () => {
  const cliArgs = parseCliArgs([
    "--log-level=verbose",
    "--host=0.0.0.0",
    "--port=8123",
    "--username=cli-user",
    "--path=dav",
  ]);

  const command = resolveCliCommand({
    cliArgs,
    env: {
      TD_PATH: "env-dav",
      TD_HOST: "127.0.0.1",
      TD_PORT: "7000",
      TD_USERNAME: "env-user",
      TD_PASSWORD: "env-password",
      TD_META_TOUCH: "true",
      TD_NO_AUTH_WARNING: "true",
      TD_LOG_LEVEL: "debug",
      TD_OPEN_IN_EDITOR: "code",
    },
  });

  assertEquals(command, {
    type: "serve",
    root: "dav",
    host: "0.0.0.0",
    port: 8123,
    warnUnauthenticated: false,
    args: {
      "log-level": "verbose",
      "meta-touch": true,
      "no-auth-warning": true,
      "open-in-editor": "code",
      host: "0.0.0.0",
      password: "env-password",
      path: "dav",
      port: 8123,
      username: "cli-user",
    },
  });
});

Deno.test("CLI configuration fills serve options from env", () => {
  const command = resolveCliCommand({
    cliArgs: parseCliArgs([]),
    env: {
      TD_PATH: "dav",
      TD_HOST: "0.0.0.0",
      TD_PORT: "8123",
      TD_USERNAME: "env-user",
      TD_PASSWORD: "env-password",
      TD_META_TOUCH: "true",
      TD_NO_AUTH_WARNING: "true",
      TD_LOG_LEVEL: "debug",
      TD_OPEN_IN_EDITOR: "true",
    },
  });

  assertEquals(command.type, "serve");
  if (command.type !== "serve") {
    return;
  }
  assertEquals(command.root, "dav");
  assertEquals(command.host, "0.0.0.0");
  assertEquals(command.port, 8123);
  assertEquals(command.args.username, "env-user");
  assertEquals(command.args.password, "env-password");
  assertEquals(command.args["meta-touch"], true);
  assertEquals(command.args["no-auth-warning"], true);
  assertEquals(command.args["log-level"], "debug");
  assertEquals(command.args["open-in-editor"], true);
  assertEquals(command.warnUnauthenticated, false);
});

Deno.test("CLI configuration reports missing path as an exit command", () => {
  const command = resolveCliCommand({
    cliArgs: parseCliArgs(["--no-auth-warning"]),
    env: {},
  });

  assertEquals(command, {
    type: "exit",
    code: 1,
    stderr: "path arguments missing",
  });
});
