import { assertEquals } from "@std/assert";
import {
  createTampermonkeySubscriptionState,
  decideSubscribe,
  recordChangedSubscribeResponse,
  recordGet,
} from "./tampermonkey-subscription.ts";

Deno.test("decideSubscribe returns four immediate empty subscribe decisions", () => {
  const state = createTampermonkeySubscriptionState();

  assertEquals(decideSubscribe(state, { nowMillis: 1_000 }), { type: "empty" });
  assertEquals(decideSubscribe(state, { nowMillis: 2_000 }), { type: "empty" });
  assertEquals(decideSubscribe(state, { nowMillis: 3_000 }), { type: "empty" });
  assertEquals(decideSubscribe(state, { nowMillis: 4_000 }), { type: "empty" });
  assertEquals(decideSubscribe(state, { nowMillis: 5_000 }), {
    type: "wait",
    timeoutSeconds: 10,
  });
});

Deno.test("decideSubscribe returns refresh after an idle gap", () => {
  const state = createTampermonkeySubscriptionState({ immediateCount: 0 });

  assertEquals(decideSubscribe(state, { nowMillis: 1_000 }), {
    type: "wait",
    timeoutSeconds: 10,
  });
  assertEquals(decideSubscribe(state, { nowMillis: 12_000 }), { type: "refresh" });
});

Deno.test("recordGet and changed response reset immediate empty subscribe count", () => {
  const state = createTampermonkeySubscriptionState({ immediateCount: 0 });

  recordGet(state);
  assertEquals(decideSubscribe(state, { nowMillis: 1_000 }), { type: "empty" });

  const changedState = createTampermonkeySubscriptionState({ immediateCount: 0 });
  recordChangedSubscribeResponse(changedState);
  assertEquals(decideSubscribe(changedState, { nowMillis: 1_000 }), { type: "empty" });
});
