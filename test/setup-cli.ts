import { deadline } from "@std/async/deadline";

export function spawnCli(
  root: string,
  { args = [], env = {} }: { args?: string[]; env?: Record<string, string> } = {},
) {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr;
  listener.close();
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "mod.ts",
      `--path=${root}`,
      "--host=127.0.0.1",
      `--port=${port}`,
      "--no-auth-warning",
      ...args,
    ],
    clearEnv: true,
    env: {
      ...Object.fromEntries(
        Object.entries(Deno.env.toObject()).filter(([key]) => !key.startsWith("TD_")),
      ),
      ...env,
    },
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const listening = Promise.withResolvers<void>();
  let stdout = "";
  let exited = false;
  const output = Promise.all([
    child.status.then((status) => {
      exited = true;
      return status;
    }),
    new Response(child.stderr).text(),
    child.stdout.pipeThrough(new TextDecoderStream()).pipeTo(
      new WritableStream<string>({
        write(chunk) {
          stdout += chunk;
          if (stdout.includes("server is listening")) listening.resolve();
        },
      }),
    ),
  ]).then(([status, stderr]) => ({ ...status, stdout, stderr }));

  return {
    origin: `http://127.0.0.1:${port}`,
    output,
    waitForListening() {
      return deadline(
        Promise.race([
          listening.promise,
          output.then((result) => {
            throw new Error(`CLI exited before listening: ${result.stderr}`);
          }),
        ]),
        10000,
      );
    },
    async [Symbol.asyncDispose]() {
      if (!exited) child.kill();
      await output;
    },
  };
}
