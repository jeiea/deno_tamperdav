import { assertEquals, assertStringIncludes } from "@std/assert";
import { delay } from "@std/async/delay";
import { formatRequestLog, formatResponseLog, RequestDebugLogger } from "./debug-log.ts";

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

Deno.test("debug logger emits pending and completion logs for slow responses", async () => {
  const logs: string[] = [];
  const logger = new RequestDebugLogger({
    pendingMillis: 1,
    sink: (message) => logs.push(message),
  });

  const response = delay(5).then(() => new Response(null, { status: 204 }));
  await logger.log(new Request("http://localhost/file.txt", { method: "SUBSCRIBE" }), response);

  assertEquals(logs.length, 2);
  assertStringIncludes(logs[0]!, "SUBSCRIBE http://localhost/file.txt -> (pending: 0)");
  assertStringIncludes(logs[1]!, "SUBSCRIBE http://localhost/file.txt (pending: 0) -> 204");
});
