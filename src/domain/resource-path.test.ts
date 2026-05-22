import { assertEquals } from "@std/assert";
import { toResourcePath } from "./resource-path.ts";

Deno.test("toResourcePath keeps the URL pathname as the current resource identity", () => {
  assertEquals(toResourcePath(new URL("http://localhost:7000/Tampermonkey/sync")), {
    pathname: "/Tampermonkey/sync",
  });
});

Deno.test("toResourcePath marks raw root escape attempts", () => {
  assertEquals(toResourcePath("http://localhost:7000/../outside.user.js"), {
    pathname: "/outside.user.js",
    rootEscaped: true,
  });
});
