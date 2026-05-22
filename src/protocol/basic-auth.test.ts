import { assertEquals } from "@std/assert";
import { isAuthorized } from "./basic-auth.ts";

Deno.test("isAuthorized allows requests when no credentials are configured", () => {
  const request = new Request("http://localhost/file.txt");

  assertEquals(isAuthorized(request, {}), true);
});

Deno.test("isAuthorized preserves current non-decoded Basic credential behavior", () => {
  const accepted = new Request("http://localhost/file.txt", {
    headers: { authorization: "Basic alice:secret" },
  });
  const rejected = new Request("http://localhost/file.txt", {
    headers: { authorization: `Basic ${btoa("alice:secret")}` },
  });

  // TODO: confirm whether this behavior is still required for Tampermonkey compatibility.
  assertEquals(isAuthorized(accepted, { username: "alice", password: "secret" }), true);
  assertEquals(isAuthorized(rejected, { username: "alice", password: "secret" }), false);
});
