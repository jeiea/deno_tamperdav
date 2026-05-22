import { DavServer } from "./src/dav-server.ts";
import { parseCliArgs, resolveCliCommand } from "./src/cli/configuration.ts";

if (import.meta.main) {
  main();
}

export async function main() {
  const cliArgs = parseCliArgs(Deno.args);
  const config = String(cliArgs.config || "config.json");
  const fileConfig = await readConfigFile(config);
  const command = resolveCliCommand({
    cliArgs,
    fileConfig,
    env: {
      TD_USERNAME: Deno.env.get("TD_USERNAME"),
      TD_PASSWORD: Deno.env.get("TD_PASSWORD"),
    },
  });

  if (command.type === "help") {
    console.info(command.stdout);
    return;
  }

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

async function readConfigFile(config: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await Deno.readTextFile(config));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(`${config}: ${error}`);
      Deno.exit(1);
    }
  }
  return {};
}
