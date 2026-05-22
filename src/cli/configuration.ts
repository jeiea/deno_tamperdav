import { object } from "@optique/core/constructs";
import { lineBreak, message } from "@optique/core/message";
import { optional } from "@optique/core/modifiers";
import { option } from "@optique/core/primitives";
import { choice, integer, string } from "@optique/core/valueparser";
import { type RunOptions, runSync } from "@optique/run";
import { join } from "@std/path/join";

export type CliCommand = ExitCliCommand | ServeCliCommand;

export type CliArgs = {
  path?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  "open-in-editor"?: string | true;
  "meta-touch"?: boolean;
  "no-auth-warning"?: boolean;
  "log-level"?: LogLevel;
};

type LogLevel = "debug" | "verbose";

export type ExitCliCommand = {
  type: "exit";
  code: number;
  stderr: string;
};

export type ServeCliCommand = {
  type: "serve";
  root: string;
  host: string;
  port: number;
  warnUnauthenticated: boolean;
  args:
    & Required<Pick<CliArgs, "host" | "port">>
    & Pick<CliArgs, "path" | "username" | "password" | "open-in-editor">
    & {
      "log-level"?: LogLevel;
      "meta-touch": boolean;
      "no-auth-warning": boolean;
    };
};

export function parseCliArgs(args: string[], options: RunOptions = {}): CliArgs {
  return runSync(cliParser, {
    ...options,
    args: normalizeOpenInEditorFlag(args),
    programName: Deno.build.os === "windows" ? "TamperDAV.bat" : "./tamperdav.sh",
    help: "option",
    brief: message`Starts a WebDAV server for Tampermonkey to sync scripts with.`,
    footer:
      message`Environment variables: TD_PATH, TD_HOST, TD_PORT, TD_USERNAME, TD_PASSWORD, TD_META_TOUCH, TD_NO_AUTH_WARNING, TD_LOG_LEVEL, TD_OPEN_IN_EDITOR${lineBreak()}${lineBreak()}Command line options have precedence over environment variables.`,
  });
}

export function resolveCliCommand(
  { cliArgs, env }: {
    cliArgs: CliArgs;
    env: Record<string, string | undefined>;
  },
): CliCommand {
  const port = resolveIntegerOption(cliArgs.port, env.TD_PORT, "TD_PORT");
  if (typeof port === "string") {
    return exit(port);
  }

  const metaTouch = resolveBooleanOption(cliArgs["meta-touch"], env.TD_META_TOUCH, "TD_META_TOUCH");
  if (typeof metaTouch === "string") {
    return exit(metaTouch);
  }

  const noAuthWarning = resolveBooleanOption(
    cliArgs["no-auth-warning"],
    env.TD_NO_AUTH_WARNING,
    "TD_NO_AUTH_WARNING",
  );
  if (typeof noAuthWarning === "string") {
    return exit(noAuthWarning);
  }

  const logLevel = resolveLogLevel(cliArgs["log-level"], env.TD_LOG_LEVEL);
  if (typeof logLevel === "string" && !isLogLevel(logLevel)) {
    return exit(logLevel);
  }

  const args = {
    path: cliArgs.path ?? env.TD_PATH,
    host: cliArgs.host ?? env.TD_HOST ?? "localhost",
    port: port ?? 7000,
    username: cliArgs.username ?? env.TD_USERNAME,
    password: cliArgs.password ?? env.TD_PASSWORD,
    "open-in-editor": parseOpenInEditorCli(cliArgs["open-in-editor"]) ??
      parseOpenInEditorEnv(env.TD_OPEN_IN_EDITOR),
    "meta-touch": metaTouch ?? false,
    "no-auth-warning": noAuthWarning ?? false,
    "log-level": logLevel,
  };

  if (!args.path) {
    return exit("path arguments missing");
  }

  return {
    type: "serve",
    root: join(".", String(args.path)),
    host: String(args.host || "localhost"),
    port: Number(args.port || 7000),
    warnUnauthenticated: !args["no-auth-warning"] && (!args.username || !args.password),
    args,
  };
}

const defaultOpenInEditor = "__tamperdav_default_editor__";

const cliParser = object({
  path: optional(option("--path", string({ metavar: "PATH" }), {
    description: message`The path, relative to server.js, that will serve as storage.`,
  })),
  host: optional(option("--host", string({ metavar: "HOST" }), {
    description: message`The network address to bind on (default: localhost).`,
  })),
  port: optional(option("--port", integer({ metavar: "PORT" }), {
    description: message`The port that the server will listen on (default: 7000).`,
  })),
  username: optional(option("--username", string({ metavar: "USERNAME" }), {
    description: message`The username for clients to authenticate to the server with.`,
  })),
  password: optional(option("--password", string({ metavar: "PASSWORD" }), {
    description: message`The password for clients to authenticate to the server with.`,
  })),
  "open-in-editor": optional(option("--open-in-editor", string({ metavar: "EDITOR" }), {
    description:
      message`The editor to use when pressing the cloud editor icon in Tampermonkey. With no editor value, uses ${defaultEditorDescription()}.`,
  })),
  "meta-touch": optional(option("--meta-touch", {
    description:
      message`Updates corresponding meta file upon changing a script file, resulting in connected browsers syncing these changes.`,
  })),
  "no-auth-warning": optional(option("--no-auth-warning", {
    description:
      message`Disables the warning regarding missing authentication due to missing username and password.`,
  })),
  "log-level": optional(option("--log-level", choice(["debug", "verbose"]), {
    description: message`Enables debug logs. Use verbose to include selected headers and bodies.`,
  })),
});

function defaultEditorDescription() {
  return Deno.build.os === "windows" ? "notepad.exe" : "the editor chosen by xdg-open";
}

function normalizeOpenInEditorFlag(args: readonly string[]) {
  return args.map((arg, index) => {
    if (arg !== "--open-in-editor") {
      return arg;
    }
    const next = args[index + 1];
    return !next || next.startsWith("-") ? `--open-in-editor=${defaultOpenInEditor}` : arg;
  });
}

function resolveIntegerOption(
  cliValue: number | undefined,
  envValue: string | undefined,
  envName: string,
): number | undefined | string {
  if (cliValue !== undefined) {
    return cliValue;
  }
  if (envValue === undefined) {
    return undefined;
  }

  const parsed = Number(envValue);
  if (!Number.isInteger(parsed)) {
    return `${envName} must be an integer`;
  }
  return parsed;
}

function resolveBooleanOption(
  cliValue: boolean | undefined,
  envValue: string | undefined,
  envName: string,
): boolean | undefined | string {
  if (cliValue !== undefined) {
    return cliValue;
  }
  if (envValue === undefined) {
    return undefined;
  }

  const normalized = envValue.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return `${envName} must be a boolean`;
}

function parseOpenInEditorEnv(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase()) ? true : value;
}

function parseOpenInEditorCli(value: string | true | undefined) {
  return value === defaultOpenInEditor ? true : value;
}

function resolveLogLevel(cliValue: LogLevel | undefined, envValue: string | undefined) {
  if (cliValue !== undefined) {
    return cliValue;
  }
  if (envValue === undefined || envValue === "") {
    return undefined;
  }
  if (isLogLevel(envValue)) {
    return envValue;
  }
  return "TD_LOG_LEVEL must be debug or verbose";
}

function isLogLevel(value: string): value is LogLevel {
  return value === "debug" || value === "verbose";
}

function exit(stderr: string): ExitCliCommand {
  return {
    type: "exit",
    code: 1,
    stderr,
  };
}
