import { assertEquals } from "@std/assert";
import { parseWebDavCommand } from "./command.ts";

Deno.test("parseWebDavCommand parses PROPFIND as a list command", () => {
  const command = parseWebDavCommand(
    new Request("http://localhost:7000/Tampermonkey/sync", {
      method: "PROPFIND",
      headers: { depth: "0" },
    }),
  );

  assertEquals(command, {
    type: "list",
    path: { pathname: "/Tampermonkey/sync" },
    depth: 0,
  });
});

Deno.test("parseWebDavCommand parses PUT as a write command", () => {
  const body = new ReadableStream();
  const command = parseWebDavCommand(
    new Request("http://localhost:7000/script.user.js", {
      method: "PUT",
      body,
      headers: { "x-oc-mtime": "1700000000" },
    }),
  );

  assertEquals(command.type, "write");
  if (command.type === "write") {
    assertEquals(command.path, { pathname: "/script.user.js" });
    assertEquals(command.body, body);
    assertEquals(command.mtimeSeconds, 1700000000);
    assertEquals(command.signal.aborted, false);
  }
});

Deno.test("parseWebDavCommand preserves unknown methods", () => {
  const command = parseWebDavCommand(
    new Request("http://localhost:7000/script.user.js", {
      method: "UNKNOWN",
    }),
  );

  assertEquals(command, {
    type: "unknown",
    method: "UNKNOWN",
    path: { pathname: "/script.user.js" },
  });
});

Deno.test("parseWebDavCommand parses SUBSCRIBE timeout and depth", () => {
  const command = parseWebDavCommand(
    new Request("http://localhost:7000/Tampermonkey/sync/", {
      method: "SUBSCRIBE",
      headers: { depth: "1", timeout: "90" },
    }),
  );

  assertEquals(command.type, "subscribe");
  if (command.type === "subscribe") {
    assertEquals(command.path, { pathname: "/Tampermonkey/sync/" });
    assertEquals(command.depth, 1);
    assertEquals(command.refreshDepth, 1);
    assertEquals(command.timeoutSeconds, 90);
    assertEquals(command.signal.aborted, false);
  }
});

Deno.test("parseWebDavCommand parses EDITOR host for redirect location", () => {
  const command = parseWebDavCommand(
    new Request("http://localhost:7000/script.user.js", {
      method: "EDITOR",
      headers: { host: "localhost:7000" },
    }),
  );

  assertEquals(command, {
    type: "openEditor",
    path: { pathname: "/script.user.js" },
    host: "localhost:7000",
  });
});
