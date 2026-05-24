import { assertEquals, assertStringIncludes } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { deadline } from "@std/async/deadline";
import { delay } from "@std/async/delay";
import { join } from "@std/path";
import { setupIntegration } from "../test/setup-integration.ts";
import { DavServer } from "./dav-server.ts";

Deno.test("Given a server with files", async (test) => {
  await using root = await createTempDir();
  const file = join(root.path, "test.txt");
  await Deno.writeTextFile(file, "Hello, world!");
  await Deno.mkdir(join(root.path, "Tampermonkey/sync"), { recursive: true });
  await Deno.writeTextFile(`${root.path}/Tampermonkey/sync/test2.js`, "Hello, script!");

  using handler = new DavServer(root.path, {});
  await using server = Deno.serve({ port: 0 }, handler.logAndHandleRequest);
  const { port } = server.addr;

  await test.step("when PROPFIND", async (test) => {
    const response = await fetch(`http://localhost:${port}/`, { method: "PROPFIND" });

    await test.step("should return 207", () => {
      assertEquals(response.status, 207);
    });

    await test.step("should contain files", async () => {
      const xml = await response.text();
      assertStringIncludes(xml, "<d:href>/test.txt</d:href>");
      assertStringIncludes(xml, "<d:href>/Tampermonkey/sync/test2.js</d:href>");
    });
  });
});

Deno.test("Given fresh server", async (test) => {
  await using root = await createTempDir();
  const file = join(root.path, "test.txt");
  await Deno.writeTextFile(file, "Hello, world!");

  using handler = new DavServer(root.path, {});
  await using server = Deno.serve({ port: 0 }, handler.logAndHandleRequest);
  const { port } = server.addr;

  await test.step("when subscribe 4 times", async (test) => {
    const responses = await deadline(
      Promise.all([
        fetch(`http://localhost:${port}/`, { method: "SUBSCRIBE" }),
        fetch(`http://localhost:${port}/`, { method: "SUBSCRIBE" }),
        fetch(`http://localhost:${port}/`, { method: "SUBSCRIBE" }),
        fetch(`http://localhost:${port}/`, { method: "SUBSCRIBE" }),
      ]),
      1000,
    );

    await test.step("should return all 204", () => {
      assertEquals(responses.map((x) => x.status), [204, 204, 204, 204]);
    });
  });

  await test.step("when change a file", async (test) => {
    const responsePromise = fetch(`http://localhost:${port}/`, { method: "SUBSCRIBE" });
    await delay(800);
    await Deno.writeTextFile(file, "Can I really use shebang in js?");
    const response = await deadline(responsePromise, 1000);

    await test.step("should return 207", () => {
      assertEquals(response.status, 207);
    });

    await test.step("should contain the file", async () => {
      const xml = await response.text();
      assertStringIncludes(xml, "<d:href>/test.txt</d:href>");
    });
  });
});

Deno.test("OPTIONS returns Tampermonkey WebDAV capability headers", async () => {
  await withDavServer({}, async ({ request }) => {
    const response = await request("/", { method: "OPTIONS" });

    assertEquals(response.status, 200);
    assertEquals(response.statusText, "OK");
    assertEquals(
      response.headers.get("Access-Control-Allow-Methods"),
      [
        "GET",
        "HEAD",
        "OPTIONS",
        "PUT",
        "PROPFIND",
        "MKCOL",
        "DELETE",
        "SUBSCRIBE",
      ].join(","),
    );
    assertEquals(response.headers.get("Access-Control-Allow-Credentials"), "true");
    assertEquals(
      response.headers.get("Access-Control-Allow-Headers"),
      "Authorization,User-Agent,Content-Type,Accept,Origin,X-Requested-With,Cursor",
    );
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(
      response.headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate, post-check=0, pre-check=0",
    );
    assertEquals(await response.text(), "");
  });
});

Deno.test("unknown method returns 405 text response with WebDAV headers", async () => {
  await withDavServer({}, async ({ request }) => {
    const response = await request("/file.txt", { method: "UNKNOWN" });

    assertEquals(response.status, 405);
    assertEquals(response.statusText, "Method Not Allowed");
    assertEquals(response.headers.get("Content-Type"), "text/plain");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(
      response.headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate, post-check=0, pre-check=0",
    );
    assertEquals(await response.text(), "Unknown method: UNKNOWN");
  });
});

Deno.test("authentication rejects missing credentials", async () => {
  await withDavServer({ username: "alice", password: "secret" }, async ({ request }) => {
    const response = await request("/file.txt", { method: "GET" });

    assertEquals(response.status, 401);
    assertEquals(response.statusText, "Unauthorized");
    assertEquals(response.headers.get("WWW-Authenticate"), 'Basic realm="Enter credentials"');
    assertEquals(await response.text(), "Unauthorized");
  });
});

Deno.test("authentication accepts standard Base64 Basic credentials", async () => {
  await withDavServer({ username: "alice", password: "secret" }, async ({ root, request }) => {
    await Deno.writeTextFile(join(root, "file.txt"), "Hello");

    const accepted = await request("/file.txt", {
      method: "GET",
      headers: { authorization: `Basic ${btoa("alice:secret")}` },
    });
    const rejected = await request("/file.txt", {
      method: "GET",
      headers: { authorization: "Basic alice:secret" },
    });

    assertEquals(accepted.status, 200);
    assertEquals(await accepted.text(), "Hello");
    assertEquals(rejected.status, 401);
    assertEquals(await rejected.text(), "Unauthorized");
  });
});

Deno.test("GET returns an existing file as octet stream", async () => {
  await withDavServer({}, async ({ root, request }) => {
    await Deno.writeTextFile(join(root, "file.txt"), "Hello");

    const response = await request("/file.txt", { method: "GET" });

    assertEquals(response.status, 200);
    assertEquals(response.statusText, "OK");
    assertEquals(response.headers.get("Content-Type"), "application/octet-stream");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "Hello");
  });
});

Deno.test("GET returns 404 for a missing file", async () => {
  await withDavServer({}, async ({ request }) => {
    const response = await request("/missing.txt", { method: "GET" });

    assertEquals(response.status, 404);
    assertEquals(response.statusText, "Not Found");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
  });
});

Deno.test("GET returns 404 for a raw root escape path", async () => {
  await withDavServer({}, async ({ root, rawRequest }) => {
    await Deno.writeTextFile(join(root, "outside.user.js"), "inside root");

    const response = await rawRequest("/../outside.user.js");

    assertStringIncludes(response, "HTTP/1.1 404 Not Found");
  });
});

Deno.test("GET returns 400 for a directory", async () => {
  await withDavServer({}, async ({ root, request }) => {
    await Deno.mkdir(join(root, "dir"));

    const response = await request("/dir", { method: "GET" });

    assertEquals(response.status, 400);
    assertEquals(response.statusText, "Bad Request");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "It is a directory");
  });
});

Deno.test("HEAD returns file metadata headers without a body", async () => {
  await withDavServer({}, async ({ root, request }) => {
    await Deno.writeTextFile(join(root, "file.txt"), "Hello");

    const response = await request("/file.txt", { method: "HEAD" });

    assertEquals(response.status, 200);
    assertEquals(response.statusText, "OK");
    assertEquals(response.headers.get("Content-Length"), "5");
    assertEquals(response.headers.get("Content-Type"), "application/octet-stream");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
  });
});

Deno.test("HEAD returns 404 for a missing file", async () => {
  await withDavServer({}, async ({ request }) => {
    const response = await request("/missing.txt", { method: "HEAD" });

    assertEquals(response.status, 404);
    assertEquals(response.statusText, "Not Found");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
  });
});

Deno.test("PUT creates a file and accepts x-oc-mtime", async () => {
  await withDavServer({}, async ({ root, request }) => {
    const response = await request("/file.txt", {
      method: "PUT",
      body: "Hello",
      headers: { "x-oc-mtime": "1700000000" },
    });

    const stat = await Deno.stat(join(root, "file.txt"));
    assertEquals(response.status, 200);
    assertEquals(response.statusText, "OK");
    assertEquals(response.headers.get("X-OC-Mtime"), "accepted");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
    assertEquals(await Deno.readTextFile(join(root, "file.txt")), "Hello");
    assertEquals(Math.floor((stat.mtime?.getTime() ?? 0) / 1000), 1700000000);
  });
});

Deno.test("PUT overwrites an existing file", async () => {
  await withDavServer({}, async ({ root, request }) => {
    await Deno.writeTextFile(join(root, "file.txt"), "Before");

    const response = await request("/file.txt", { method: "PUT", body: "After" });

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
    assertEquals(await Deno.readTextFile(join(root, "file.txt")), "After");
  });
});

Deno.test("DELETE removes an existing file", async () => {
  await withDavServer({}, async ({ root, request }) => {
    const file = join(root, "file.txt");
    await Deno.writeTextFile(file, "Hello");

    const response = await request("/file.txt", { method: "DELETE" });

    assertEquals(response.status, 204);
    assertEquals(response.statusText, "No Content");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
    await assertNotFound(file);
  });
});

Deno.test("DELETE returns 404 for a missing file", async () => {
  await withDavServer({}, async ({ request }) => {
    const response = await request("/missing.txt", { method: "DELETE" });

    assertEquals(response.status, 404);
    assertEquals(response.statusText, "Not Found");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(await response.text(), "");
  });
});

Deno.test("MKCOL creates a collection and returns multistatus XML", async () => {
  await withDavServer({}, async ({ root, request }) => {
    const response = await request("/new-dir", { method: "MKCOL" });
    const xml = await response.text();

    assertEquals(response.status, 207);
    assertEquals(response.statusText, "Multi-Status");
    assertEquals(response.headers.get("Content-Type"), "application/xml; charset=utf-8");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals((await Deno.stat(join(root, "new-dir"))).isDirectory, true);
    assertMultistatusXml(xml);
    assertStringIncludes(xml, "<d:href>/new-dir</d:href>");
    assertStringIncludes(xml, "<d:resourcetype><d:collection/></d:resourcetype>");
    assertStringIncludes(xml, "<d:getcontentlength />");
  });
});

Deno.test("MKCOL returns XML error when collection already exists", async () => {
  await withDavServer({}, async ({ root, request }) => {
    await Deno.mkdir(join(root, "new-dir"));

    const response = await request("/new-dir", { method: "MKCOL" });

    assertEquals(response.status, 405);
    assertEquals(response.statusText, "Method Not Allowed");
    assertEquals(response.headers.get("Content-Type"), "application/xml; charset=utf-8");
    assertEquals(response.headers.get("DAV"), "1");
    assertEquals(
      await response.text(),
      '<d:error xmlns:d="DAV:" xmlns:td="http://dav.tampermonkey.net/ns"><td:exception>MethodNotAllowed</td:exception><td:message>The resource you tried to create already exists</td:message></d:error>',
    );
  });
});

Deno.test("PROPFIND depth 0 returns only the requested collection", async () => {
  await withDavServer({}, async ({ root, request }) => {
    await Deno.mkdir(join(root, "dir"));
    await Deno.writeTextFile(join(root, "dir", "file.txt"), "Hello");

    const response = await request("/dir", {
      method: "PROPFIND",
      headers: { depth: "0" },
    });
    const xml = await response.text();

    assertEquals(response.status, 207);
    assertEquals(response.statusText, "Multi-Status");
    assertEquals(response.headers.get("Content-Type"), "application/xml; charset=utf-8");
    assertEquals(response.headers.get("DAV"), "1");
    assertMultistatusXml(xml);
    assertStringIncludes(xml, "<d:href>/dir</d:href>");
    assertEquals(xml.includes("<d:href>/dir/file.txt</d:href>"), false);
  });
});

Deno.test("debug verbose logs request and response details without sensitive headers", async () => {
  using integration = setupIntegration();
  const { logs } = integration;

  await withDavServer(
    { "log-level": "verbose", username: "alice", password: "secret" },
    async ({ request }) => {
      const response = await request("/file.txt", {
        method: "UNKNOWN",
        headers: {
          authorization: `Basic ${btoa("alice:secret")}`,
          cursor: "123",
        },
      });
      await response.text();
      await delay(0);
    },
  );

  const log = logs.join("\n");
  assertStringIncludes(log, "] UNKNOWN");
  assertStringIncludes(log, "/file.txt");
  assertStringIncludes(log, "405 Method Not Allowed");
  assertStringIncludes(log, "cursor: 123");
  assertStringIncludes(log, "Unknown method: UNKNOWN");
  assertEquals(log.toLowerCase().includes("authorization"), false);
  assertEquals(log.includes("alice"), false);
  assertEquals(log.includes("secret"), false);
});

type TestServer = {
  root: string;
  origin: string;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  rawRequest: (path: string) => Promise<string>;
};

async function withDavServer(
  args: ConstructorParameters<typeof DavServer>[1],
  fn: (server: TestServer) => Promise<void>,
) {
  await using root = await createTempDir();
  using handler = new DavServer(root.path, args);
  await using server = Deno.serve({ port: 0 }, handler.logAndHandleRequest);
  const { port } = server.addr;
  const origin = `http://localhost:${port}`;

  await fn({
    root: root.path,
    origin,
    request: (path, init) => fetch(`${origin}${path}`, init),
    rawRequest: async (path) => {
      const conn = await Deno.connect({ hostname: "127.0.0.1", port });
      await conn.write(
        new TextEncoder().encode(
          `GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
        ),
      );
      return await new Response(conn.readable).text();
    },
  });
}

function assertMultistatusXml(xml: string) {
  assertStringIncludes(
    xml,
    '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:td="http://dav.tampermonkey.net/ns">',
  );
  assertStringIncludes(xml, "</d:multistatus>");
  assertStringIncludes(xml, "<d:response>");
  assertStringIncludes(xml, "<d:propstat>");
  assertStringIncludes(xml, "<d:prop>");
  assertStringIncludes(xml, "<d:getlastmodified>");
  assertStringIncludes(xml, "<d:status>HTTP/1.1 200 OK</d:status>");
}

async function assertNotFound(path: string) {
  try {
    await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected ${path} to be missing`);
}
