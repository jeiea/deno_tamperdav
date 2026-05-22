export class RequestDebugLogger {
  readonly #pendingMillis: number;
  readonly #sink: (message: string) => void;
  readonly #verbose: boolean;
  #lastRequestId = 0;

  constructor(
    { pendingMillis = 100, sink = console.debug, verbose = false }: {
      pendingMillis?: number;
      sink?: (message: string) => void;
      verbose?: boolean;
    } = {},
  ) {
    this.#pendingMillis = pendingMillis;
    this.#sink = sink;
    this.#verbose = verbose;
  }

  async log(request: Request, responsePromise: Promise<Response>) {
    const pending = Symbol("pending");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<typeof pending>((resolve) => {
      timeoutId = setTimeout(() => resolve(pending), this.#pendingMillis);
    });

    const maybeResponse = await Promise.race([responsePromise, timeoutPromise]);
    clearTimeout(timeoutId);

    const requestLog = formatRequestLog(request, { verbose: this.#verbose });
    if (maybeResponse instanceof Response) {
      const responseLog = await formatResponseLog(maybeResponse, { verbose: this.#verbose });
      this.#sink(`${requestLog}${this.#verbose ? "\n" : " -> "}${responseLog}`);
      return;
    }

    const requestId = this.#lastRequestId++;
    this.#sink(`${requestLog} -> (pending: ${requestId})`);
    const response = await responsePromise;
    const responseLog = await formatResponseLog(response, { verbose: this.#verbose });
    this.#sink(`${formatRequestLog(request, {})} (pending: ${requestId}) -> ${responseLog}`);
  }
}

export function formatRequestLog(request: Request, { verbose }: { verbose?: boolean } = {}) {
  if (!verbose) {
    return `${request.method} ${request.url}`;
  }

  const log = [`${request.method} ${request.url}`];
  request.headers.forEach((value, key) => {
    if (
      key.match(
        /accept|authorization|connection|content-type|dnt|host|origin|sec-|user-agent/i,
      )
    ) {
      return;
    }
    log.push(`${key}: ${value}`);
  });
  return log.join("\n");
}

export async function formatResponseLog(
  response: Response,
  { verbose }: { verbose?: boolean } = {},
) {
  const log = [`${response.status} ${response.statusText}`];
  if (!verbose) {
    return log.join("\n");
  }

  response.headers.forEach((value, key) => {
    log.push(`${key}: ${value}`);
  });
  log.push("");

  const text = await response.clone().text();
  log.push(text);

  return log.join("\n");
}
