import { DavServer } from "./src/dav-server.ts";
import { parseCliArgs, resolveCliCommand } from "./src/cli/configuration.ts";

if (import.meta.main) {
  main();
}

export async function main() {
  const cliArgs = parseCliArgs(Deno.args);
  const command = resolveCliCommand({
    cliArgs,
    env: {
      TD_PATH: Deno.env.get("TD_PATH"),
      TD_HOST: Deno.env.get("TD_HOST"),
      TD_PORT: Deno.env.get("TD_PORT"),
      TD_USERNAME: Deno.env.get("TD_USERNAME"),
      TD_PASSWORD: Deno.env.get("TD_PASSWORD"),
      TD_META_TOUCH: Deno.env.get("TD_META_TOUCH"),
      TD_NO_AUTH_WARNING: Deno.env.get("TD_NO_AUTH_WARNING"),
      TD_LOG_LEVEL: Deno.env.get("TD_LOG_LEVEL"),
      TD_OPEN_IN_EDITOR: Deno.env.get("TD_OPEN_IN_EDITOR"),
    },
  });

  if (command.type === "exit") {
    console.error(command.stderr);
    Deno.exit(command.code);
  }

  await Deno.mkdir(command.root, { recursive: true });

  if (command.warnUnauthenticated) {
    console.warn(
      "TamperDAV is running without any form of authentication. It's strongly recommended to configure username and password!",
    );
  }

  const server = Deno.serve(
    {
      hostname: command.host,
      port: command.port,
      onError: (error) => {
        console.error(error);
        return new Response(`${error}`, { status: 500 });
      },
    },
    new DavServer(command.root, command.args).logAndHandleRequest,
  );

  console.info(`server is listening on ${command.port}`);
  return server;
}
