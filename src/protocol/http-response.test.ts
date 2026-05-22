import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderHttpResponse } from "./http-response.ts";

Deno.test("renderHttpResponse renders an empty response", async () => {
  const response = renderHttpResponse({
    type: "empty",
    status: 204,
    headers: { DAV: "1" },
  });

  assertEquals(response.status, 204);
  assertEquals(response.statusText, "No Content");
  assertEquals(response.headers.get("DAV"), "1");
  assertEquals(await response.text(), "");
});

Deno.test("renderHttpResponse renders a body response", async () => {
  const response = renderHttpResponse({
    type: "body",
    status: 405,
    statusText: "Method Not Allowed",
    body: "Unknown method: UNKNOWN",
    headers: { "Content-Type": "text/plain" },
  });

  assertEquals(response.status, 405);
  assertEquals(response.statusText, "Method Not Allowed");
  assertEquals(response.headers.get("Content-Type"), "text/plain");
  assertEquals(await response.text(), "Unknown method: UNKNOWN");
});

Deno.test("renderHttpResponse renders a multistatus response", async () => {
  const response = renderHttpResponse({
    type: "multistatus",
    resources: [
      {
        href: "/script.user.js",
        lastModified: new Date("2024-01-02T03:04:05.000Z"),
        size: 12,
        isCollection: false,
      },
    ],
  });
  const xml = await response.text();

  assertEquals(response.status, 207);
  assertEquals(response.statusText, "Multi-Status");
  assertEquals(response.headers.get("Content-Type"), "application/xml; charset=utf-8");
  assertStringIncludes(xml, "<d:href>/script.user.js</d:href>");
});
