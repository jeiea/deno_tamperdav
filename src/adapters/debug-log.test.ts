import { assertEquals, assertStringIncludes } from "@std/assert";
import { setupIntegration } from "../../test/setup-integration.ts";
import {
  formatPendingStatusAroundLog,
  formatRequestLog,
  formatResponseLog,
  RequestDebugLogger,
} from "./debug-log.ts";

Deno.test("request debug log includes useful headers and filters sensitive headers", () => {
  const request = new Request("http://localhost/file.txt", {
    method: "PROPFIND",
    headers: {
      authorization: "Basic alice:secret",
      cursor: "123",
      depth: "1",
      "user-agent": "browser",
    },
  });

  const log = formatRequestLog(request, { verbose: true });

  assertStringIncludes(log, "PROPFIND http://localhost/file.txt");
  assertStringIncludes(log, "cursor: 123");
  assertStringIncludes(log, "depth: 1");
  assertEquals(log.toLowerCase().includes("authorization"), false);
  assertEquals(log.includes("alice"), false);
  assertEquals(log.includes("secret"), false);
  assertEquals(log.toLowerCase().includes("user-agent"), false);
});

Deno.test("response debug log clones the body for verbose logging", async () => {
  const response = new Response("Unknown method: UNKNOWN", {
    status: 405,
    statusText: "Method Not Allowed",
  });

  const log = await formatResponseLog(response, { verbose: true });

  assertStringIncludes(log, "405 Method Not Allowed");
  assertStringIncludes(log, "Unknown method: UNKNOWN");
  assertEquals(await response.text(), "Unknown method: UNKNOWN");
});

Deno.test("debug logger emits timestamped completion logs", async () => {
  using integration = setupIntegration({ now: new Date(2026, 4, 23, 0, 0, 1, 123) });
  const { logs } = integration;

  const logger = new RequestDebugLogger();
  const response = Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
  await logger.log(new Request("http://localhost/file.txt", { method: "SUBSCRIBE" }), response);

  assertEquals(logs, [
    "[2026-05-23T00:00:01.123] SUBSCRIBE http://localhost/file.txt -> 204 No Content",
  ]);
});

Deno.test("debug logger emits elapsed timestamp range for slow responses without request IDs", async () => {
  using integration = setupIntegration({ now: new Date(2026, 4, 23, 0, 0, 1) });
  const { delayedResponse, logs, time } = integration;

  const logger = new RequestDebugLogger({ pendingMillis: 1 });
  const response = delayedResponse(
    9_000,
    new Response(null, { status: 204, statusText: "No Content" }),
  );
  const log = logger.log(
    new Request("http://localhost/file.txt", { method: "SUBSCRIBE" }),
    response,
  );

  time.tick(1);
  await time.runMicrotasks();
  time.tick(8_999);
  await log;

  assertEquals(logs, [
    "[2026-05-23T00:00:01~2026-05-23T00:00:10] SUBSCRIBE http://localhost/file.txt -> 204 No Content",
  ]);
});

Deno.test("debug logger includes verbose details for slow responses", async () => {
  using integration = setupIntegration({ now: new Date(2026, 4, 23, 0, 0, 1) });
  const { delayedResponse, logs, time } = integration;

  const logger = new RequestDebugLogger({ pendingMillis: 1, verbose: true });
  const response = delayedResponse(
    9_000,
    new Response("Done", {
      headers: { cursor: "123" },
      status: 207,
      statusText: "Multi-Status",
    }),
  );
  const log = logger.log(
    new Request("http://localhost/file.txt", {
      headers: { cursor: "122" },
      method: "SUBSCRIBE",
    }),
    response,
  );

  time.tick(1);
  await time.runMicrotasks();
  time.tick(8_999);
  await log;

  assertEquals(logs, [
    [
      "[2026-05-23T00:00:01~2026-05-23T00:00:10] SUBSCRIBE http://localhost/file.txt -> 207 Multi-Status",
      "cursor: 122",
      "content-type: text/plain;charset=UTF-8",
      "cursor: 123",
      "",
      "Done",
    ].join("\n"),
  ]);
});

Deno.test("debug logger updates tty pending count with carriage returns", async () => {
  using integration = setupIntegration({ now: new Date(2026, 4, 23, 0, 0, 1), terminal: true });
  const { delayedResponse, logs, stderr: status, time } = integration;

  const logger = new RequestDebugLogger({ pendingMillis: 1 });
  const response = delayedResponse(
    9_000,
    new Response(null, { status: 204, statusText: "No Content" }),
  );
  const log = logger.log(
    new Request("http://localhost/file.txt", { method: "SUBSCRIBE" }),
    response,
  );

  time.tick(1);
  await time.runMicrotasks();
  time.tick(8_999);
  await log;

  assertEquals(status, ["\rPending: 1", "\r          \r"]);
  assertEquals(logs, [
    "[2026-05-23T00:00:01~2026-05-23T00:00:10] SUBSCRIBE http://localhost/file.txt -> 204 No Content",
  ]);
});

Deno.test("debug logger keeps remaining tty pending count after completed logs", async () => {
  using integration = setupIntegration({ now: new Date(2026, 4, 23, 0, 0, 1), terminal: true });
  const { delayedResponse, logs, stderr: status, time } = integration;

  const logger = new RequestDebugLogger({ pendingMillis: 1 });
  const first = logger.log(
    new Request("http://localhost/first", { method: "SUBSCRIBE" }),
    delayedResponse(2_000, new Response(null, { status: 204, statusText: "No Content" })),
  );
  const second = logger.log(
    new Request("http://localhost/second", { method: "SUBSCRIBE" }),
    delayedResponse(50_000, new Response(null, { status: 204, statusText: "No Content" })),
  );

  time.tick(1);
  await time.runMicrotasks();
  time.tick(1_999);
  await first;

  assertEquals(status, [
    "\rPending: 1",
    "\rPending: 2",
    "\r          \r",
    "\rPending: 1",
  ]);
  assertEquals(logs, [
    "[2026-05-23T00:00:01~2026-05-23T00:00:03] SUBSCRIBE http://localhost/first -> 204 No Content",
  ]);

  time.tick(48_000);
  await second;
});

Deno.test("formatPendingStatusAroundLog clears tty pending status before fast response logs", () => {
  const update = formatPendingStatusAroundLog(
    { count: 1, lastStatusLength: "Pending: 1".length },
    { tty: true },
  );

  assertEquals(update, {
    state: { count: 1, lastStatusLength: "Pending: 1".length },
    beforeLogMessages: ["\r          \r"],
    afterLogMessages: ["\rPending: 1"],
  });
});
