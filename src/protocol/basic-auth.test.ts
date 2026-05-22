import { assertEquals } from "@std/assert";
import { isAuthorized } from "./basic-auth.ts";

Deno.test("isAuthorized allows requests when no credentials are configured", () => {
  const request = new Request("http://localhost/file.txt");

  assertEquals(isAuthorized(request, {}), true);
});

Deno.test("isAuthorized accepts standard Base64 Basic credentials", () => {
  const accepted = new Request("http://localhost/file.txt", {
    headers: { authorization: `Basic ${btoa("alice:secret")}` },
  });
  const rejected = new Request("http://localhost/file.txt", {
    headers: { authorization: "Basic alice:secret" },
  });

  assertEquals(isAuthorized(accepted, { username: "alice", password: "secret" }), true);
  assertEquals(isAuthorized(rejected, { username: "alice", password: "secret" }), false);
});
