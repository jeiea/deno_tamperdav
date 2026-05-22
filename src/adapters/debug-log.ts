export type LogLevel = "debug" | "verbose";

export type PendingStatusState = {
  count: number;
  lastStatusLength: number;
};

export type PendingStatusAroundLog = {
  state: PendingStatusState;
  beforeLogMessages: string[];
  afterLogMessages: string[];
};

type PendingStatusUpdate = {
  state: PendingStatusState;
  messages: string[];
};

export class RequestDebugLogger {
  readonly #pendingMillis: number;
  readonly #verbose: boolean;
  #pendingStatus = createPendingStatusState();

  constructor(
    { pendingMillis = 100, verbose = false }: { pendingMillis?: number; verbose?: boolean } = {},
  ) {
    this.#pendingMillis = pendingMillis;
    this.#verbose = verbose;
  }

  async log(request: Request, responsePromise: Promise<Response>) {
    const start = new Date();
    const pending = Symbol("pending");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<typeof pending>((resolve) => {
      timeoutId = setTimeout(() => resolve(pending), this.#pendingMillis);
    });

    const maybeResponse = await Promise.race([responsePromise, timeoutPromise]);
    clearTimeout(timeoutId);

    if (maybeResponse instanceof Response) {
      const responseLog = await formatResponseLog(maybeResponse, { verbose: this.#verbose });
      this.#writeExchangeLog(
        formatExchangeLog(request, responseLog, { start, verbose: this.#verbose }),
      );
      return;
    }

    this.#writePendingStatus(
      incrementPendingStatus(this.#pendingStatus, { tty: Deno.stderr.isTerminal() }),
    );
    const response = await responsePromise;
    const responseLog = await formatResponseLog(response, { verbose: this.#verbose });
    const end = new Date();
    this.#writePendingStatus(decrementPendingStatus(this.#pendingStatus));
    this.#writeExchangeLog(
      formatExchangeLog(request, responseLog, { start, end, verbose: this.#verbose }),
    );
  }

  #writeExchangeLog(message: string) {
    const update = formatPendingStatusAroundLog(this.#pendingStatus, {
      tty: Deno.stderr.isTerminal(),
    });
    this.#pendingStatus = update.state;

    writeStderrMessages(update.beforeLogMessages);
    console.debug(message);
    writeStderrMessages(update.afterLogMessages);
  }

  #writePendingStatus(update: PendingStatusUpdate) {
    this.#pendingStatus = update.state;
    writeStderrMessages(update.messages);
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

export function formatPendingStatusAroundLog(
  state: PendingStatusState,
  { tty }: { tty: boolean },
): PendingStatusAroundLog {
  const beforeLog = clearPendingStatus(state, { tty });
  const afterLog = refreshPendingStatus(beforeLog.state, { tty });
  return {
    state: afterLog.state,
    beforeLogMessages: beforeLog.messages,
    afterLogMessages: afterLog.messages,
  };
}

function formatExchangeLog(
  request: Request,
  responseLog: string,
  { start, end, verbose }: { start: Date; end?: Date; verbose?: boolean },
) {
  const timestamp = end
    ? `${formatLocalTimestamp(start)}~${formatLocalTimestamp(end)}`
    : formatLocalTimestamp(start, { milliseconds: true });
  const requestLog = formatRequestLog(request);
  if (!verbose) {
    return `[${timestamp}] ${requestLog} -> ${responseLog}`;
  }

  const requestDetails = formatRequestLog(request, { verbose: true }).split("\n").slice(1);
  const [responseSummary, ...responseDetails] = responseLog.split("\n");
  return [
    `[${timestamp}] ${requestLog} -> ${responseSummary}`,
    ...requestDetails,
    ...responseDetails,
  ].join("\n");
}

function formatLocalTimestamp(date: Date, { milliseconds = false } = {}) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const timestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  if (!milliseconds) {
    return timestamp;
  }
  return `${timestamp}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function createPendingStatusState(): PendingStatusState {
  return { count: 0, lastStatusLength: 0 };
}

function incrementPendingStatus(
  state: PendingStatusState,
  { tty }: { tty: boolean },
): PendingStatusUpdate {
  const next = { ...state, count: state.count + 1 };
  if (!tty) {
    return { state: next, messages: [] };
  }
  return writePendingStatus(next);
}

function decrementPendingStatus(state: PendingStatusState): PendingStatusUpdate {
  return { state: { ...state, count: state.count - 1 }, messages: [] };
}

function clearPendingStatus(
  state: PendingStatusState,
  { tty }: { tty: boolean },
): PendingStatusUpdate {
  if (!tty || state.lastStatusLength === 0) {
    return { state, messages: [] };
  }
  return {
    state: { ...state, lastStatusLength: 0 },
    messages: [`\r${" ".repeat(state.lastStatusLength)}\r`],
  };
}

function refreshPendingStatus(
  state: PendingStatusState,
  { tty }: { tty: boolean },
): PendingStatusUpdate {
  if (!tty || state.count === 0) {
    return { state, messages: [] };
  }
  return writePendingStatus(state);
}

function writePendingStatus(state: PendingStatusState): PendingStatusUpdate {
  const message = `Pending: ${state.count}`;
  return {
    state: { ...state, lastStatusLength: message.length },
    messages: [`\r${message}`],
  };
}

function writeStderrMessages(messages: string[]) {
  const encoder = new TextEncoder();
  for (const message of messages) {
    Deno.stderr.writeSync(encoder.encode(message));
  }
}
