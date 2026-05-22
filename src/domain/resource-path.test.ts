import { assertEquals } from "@std/assert";
import { toResourcePath } from "./resource-path.ts";

Deno.test("toResourcePath keeps the URL pathname as the current resource identity", () => {
  assertEquals(toResourcePath(new URL("http://localhost:7000/Tampermonkey/sync")), {
    pathname: "/Tampermonkey/sync",
  });
});

Deno.test("toResourcePath preserves the current root escape surface", () => {
  // TODO: confirm whether this behavior is still required for Tampermonkey compatibility.
  assertEquals(toResourcePath(new URL("http://localhost:7000/../outside.user.js")), {
    pathname: "/outside.user.js",
  });
});
