import { assertEquals, assertStringIncludes } from "@std/assert";
import { createTempDir } from "@jeiea/snippets";
import { join, resolve } from "@std/path";
import { runDavApplicationCommand } from "./dav-application.ts";
import { createTampermonkeySubscriptionState } from "../compatibility/tampermonkey-subscription.ts";
import { createDenoFsResourceStore } from "../storage/deno-fs-resource-store.ts";
import type { ResourceStore } from "../storage/resource-store.ts";
import type { Subscriber, SubscriptionRequest } from "../subscription/subscriber.ts";

Deno.test("runDavApplicationCommand returns OPTIONS capabilities from app configuration", async () => {
  const response = await runDavApplicationCommand(
    { type: "options", path: { pathname: "/" } },
    baseContext({ openInEditor: "code" }),
  );

  assertEquals(response.type, "empty");
  assertEquals(response.status, 200);
  assertEquals(response.headers, {
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS,PUT,PROPFIND,MKCOL,DELETE,SUBSCRIBE,EDITOR",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "Authorization,User-Agent,Content-Type,Accept,Origin,X-Requested-With,Cursor",
  });
});

Deno.test("runDavApplicationCommand refreshes SUBSCRIBE with a list response after compatibility delay", async () => {
  await using root = await createTempDir();
  await Deno.writeTextFile(join(root.path, "file.txt"), "Hello");

  const response = await runDavApplicationCommand(
    {
      type: "subscribe",
      path: { pathname: "/" },
      depth: 0,
      refreshDepth: 1,
      timeoutSeconds: 60,
      signal: new AbortController().signal,
    },
    baseContext({
      root: root.path,
      store: createDenoFsResourceStore(root.path),
      compatibility: createTampermonkeySubscriptionState({
        immediateCount: 0,
        lastSubscribeAt: 0,
      }),
      now: () => new Date(12_000),
      subscriber: {
        subscribe: () => {
          throw new Error("subscriber should not be used for refresh");
        },
        [Symbol.dispose]: () => {},
      },
    }),
  );

  assertEquals(response.type, "multistatus");
  if (response.type === "multistatus") {
    assertEquals(response.resources.map((resource) => resource.href), ["/", "/file.txt"]);
  }
});

Deno.test("runDavApplicationCommand opens an existing file through the editor launcher", async () => {
  await using root = await createTempDir();
  const launched: Array<{ path: string; app: string }> = [];
  await Deno.writeTextFile(join(root.path, "script.user.js"), "console.log('hi')");

  const response = await runDavApplicationCommand(
    {
      type: "openEditor",
      path: { pathname: "/script.user.js" },
      host: "localhost:7000",
    },
    baseContext({
      root: root.path,
      store: createDenoFsResourceStore(root.path),
      openInEditor: true,
      os: "windows",
      launchEditor: (path, { app }) => {
        launched.push({ path, app });
      },
    }),
  );

  assertEquals(response.type, "empty");
  assertEquals(response.status, 302);
  assertEquals(response.headers, { Location: "dav://localhost:7000/script.user.js" });
  assertEquals(launched, [{ path: resolve(root.path, "script.user.js"), app: "notepad" }]);
});

Deno.test("runDavApplicationCommand returns changed script and touched meta file", async () => {
  await using root = await createTempDir();
  await Deno.writeTextFile(join(root.path, "script.user.js"), "console.log('hi')");
  await Deno.writeTextFile(join(root.path, "script.meta.json"), "{}");

  const response = await runDavApplicationCommand(
    {
      type: "subscribe",
      path: { pathname: "/" },
      depth: 0,
      refreshDepth: 1,
      timeoutSeconds: 60,
      signal: new AbortController().signal,
    },
    baseContext({
      root: root.path,
      store: createDenoFsResourceStore(root.path),
      compatibility: createTampermonkeySubscriptionState({ immediateCount: 0 }),
      metaTouch: true,
      subscriber: resolvedSubscriber(new Set(["script.user.js"])),
      now: () => new Date(10_000),
    }),
  );

  assertEquals(response.type, "multistatus");
  if (response.type !== "multistatus") {
    return;
  }

  const hrefs = response.resources.map((resource) => resource.href);
  assertStringIncludes(hrefs.join("\n"), "/script.user.js");
  assertStringIncludes(hrefs.join("\n"), "/script.meta.json");
});

function baseContext(
  overrides: Partial<Parameters<typeof runDavApplicationCommand>[1]> = {},
): Parameters<typeof runDavApplicationCommand>[1] {
  return {
    root: ".",
    store: throwingStore(),
    subscriber: resolvedSubscriber(new Set()),
    compatibility: createTampermonkeySubscriptionState(),
    metaTouch: false,
    ...overrides,
  };
}

function resolvedSubscriber(paths: Set<string>): Subscriber {
  return {
    subscribe: (_request: SubscriptionRequest) => Promise.resolve(paths),
    [Symbol.dispose]: () => {},
  };
}

function throwingStore(): ResourceStore {
  return {
    list: () => {
      throw new Error("unexpected list");
    },
    read: () => {
      throw new Error("unexpected read");
    },
    stat: () => {
      throw new Error("unexpected stat");
    },
    write: () => {
      throw new Error("unexpected write");
    },
    delete: () => {
      throw new Error("unexpected delete");
    },
    makeCollection: () => {
      throw new Error("unexpected makeCollection");
    },
  };
}
