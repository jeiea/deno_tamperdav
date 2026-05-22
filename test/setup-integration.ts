import { stub } from "@std/testing/mock";
import { FakeTime } from "@std/testing/time";

type IntegrationOptions = {
  now?: Date;
  terminal?: boolean;
};

type IntegrationSetup = Disposable & {
  logs: string[];
  stderr: string[];
  delayedResponse: typeof delayedResponse;
};

type TimedIntegrationSetup = IntegrationSetup & {
  time: FakeTime;
};

export function setupIntegration(
  options: IntegrationOptions & { now: Date },
): TimedIntegrationSetup;
export function setupIntegration(options?: IntegrationOptions): IntegrationSetup;
export function setupIntegration(
  { now, terminal = false }: IntegrationOptions = {},
): IntegrationSetup {
  const logs: string[] = [];
  const stderr: string[] = [];
  const disposables: Disposable[] = [];

  const time = now ? new FakeTime(now) : undefined;
  if (time) {
    disposables.push(time);
  }

  disposables.push(stub(console, "debug", (message?: unknown) => {
    logs.push(String(message));
  }));

  const decoder = new TextDecoder();
  disposables.push(stub(Deno.stderr, "writeSync", (data: Uint8Array) => {
    stderr.push(decoder.decode(data));
    return data.byteLength;
  }));

  disposables.push(stub(Deno.stderr, "isTerminal", () => terminal));

  return {
    logs,
    stderr,
    ...(time ? { time } : {}),
    delayedResponse,
    [Symbol.dispose]() {
      for (const disposable of disposables.toReversed()) {
        disposable[Symbol.dispose]();
      }
    },
  };
}

function delayedResponse(milliseconds: number, response: Response) {
  return new Promise<Response>((resolve) => {
    setTimeout(() => resolve(response), milliseconds);
  });
}
