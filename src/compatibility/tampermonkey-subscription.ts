const TAMPERMONKEY_VOID_SUBSCRIBE_COUNT = 4;

export type TampermonkeySubscriptionState = {
  immediateCount: number;
  lastSubscribeAt?: number;
};

export type SubscribeCompatibilityDecision =
  | { type: "empty" }
  | { type: "refresh" }
  | { type: "wait"; timeoutSeconds: number };

export function createTampermonkeySubscriptionState(
  state: Partial<TampermonkeySubscriptionState> = {},
): TampermonkeySubscriptionState {
  return {
    immediateCount: state.immediateCount ?? TAMPERMONKEY_VOID_SUBSCRIBE_COUNT,
    lastSubscribeAt: state.lastSubscribeAt,
  };
}

export function recordGet(state: TampermonkeySubscriptionState) {
  state.immediateCount = TAMPERMONKEY_VOID_SUBSCRIBE_COUNT;
}

export function recordChangedSubscribeResponse(state: TampermonkeySubscriptionState) {
  state.immediateCount = TAMPERMONKEY_VOID_SUBSCRIBE_COUNT;
}

export function decideSubscribe(
  state: TampermonkeySubscriptionState,
  { nowMillis }: { nowMillis: number },
): SubscribeCompatibilityDecision {
  const lastDiffMillis = nowMillis - (state.lastSubscribeAt ?? 0);
  state.lastSubscribeAt = nowMillis;

  if (state.immediateCount > 0) {
    state.immediateCount--;
    return { type: "empty" };
  }

  if (lastDiffMillis >= 11_000) {
    return { type: "refresh" };
  }

  return { type: "wait", timeoutSeconds: 10 };
}
