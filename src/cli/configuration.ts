import { parseArgs } from "@std/cli/parse-args";
import { join } from "@std/path/join";

export type CliCommand = HelpCliCommand | ExitCliCommand | ServeCliCommand;

export type HelpCliCommand = {
  type: "help";
  stdout: string;
};

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
  args: Record<string, unknown>;
};

export function parseCliArgs(args: string[]): Record<string, unknown> {
  return parseArgs(args, {
    boolean: ["help", "no-auth-warning", "meta-touch", "debug"],
    string: ["config", "path", "open-in-editor", "host", "port", "username", "password"],
  });
}

export function resolveCliCommand(
  { cliArgs, fileConfig, env, os = Deno.build.os }: {
    cliArgs: Record<string, unknown>;
    fileConfig: Record<string, unknown>;
    env: Record<string, string | undefined>;
    os?: typeof Deno.build.os;
  },
): CliCommand {
  if (cliArgs.help) {
    return {
      type: "help",
      stdout: renderHelp(os),
    };
  }

  const args = { ...fileConfig, ...cliArgs };
  args.username ??= env.TD_USERNAME;
  args.password ??= env.TD_PASSWORD;

  if (!args.path) {
    return {
      type: "exit",
      code: 1,
      stderr: "path arguments missing",
    };
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

export function renderHelp(os: typeof Deno.build.os) {
  return `Usage: ${os === "windows" ? "TamperDAV.bat" : "./tamperdav.sh"} [options]
Starts a WebDAV server for Tampermonkey to sync scripts with.

Options:
        --help                     Shows this information
        --config=[path]            Uses the specified config file (default: config.json)
        --no-auth-warning          Disables the warning regarding missing authentication due
                                   to missing username and password
        --meta-touch               Updates corresponding meta file upon changing a script
                                   file, resulting in connected browsers syncing these changes
        --debug                    Provides some more detailed output for debugging purposes
        --open-in-editor=[editor]  The editor to use when pressing the cloud editor icon in
                                   Tampermonkey
        --open-in-editor           Same as above, but uses ${
    os === "windows" ? "notepad.exe" : "the editor chosen by xdg-open"
  }
        --username=[username]      The username for clients to authenticate to the server with
        --password=[password]      The password for clients to authenticate to the server with
        --host=[host]              The network address to bind on (default: localhost)
        --port=[port]              The port that the server will listen on (default: 7000)
        --path=[path]              The path, relativePath to server.js, that will serve as storage

All of these options except "--help" can be specified in a JSON formatted file config.json
in the same directory as server.js. An example is:
{
    "path": "dav",
    "meta-touch": true,
    "username": "foo",
    "password": "bar",
    "port": 1234
}

Options provided as command line parameters all have precedence over options stored in the
config file.

Username and password can also be specified in the environment variables TD_USERNAME and
TD_PASSWORD respectively. These have priority over over the config file, but not over the
command line parameters.
`;
}
