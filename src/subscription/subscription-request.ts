import { normalize } from "@std/path/posix";
import type { SubscriptionRequest } from "./subscriber.ts";

export function toSubscription(request: Request): SubscriptionRequest {
  return {
    path: normalize(`${new URL(request.url).pathname}`.replace(/^\/+|\/+$/g, "")) || ".",
    timeoutSeconds: getTimeoutSeconds(request),
    depth: getDepth(request),
    signal: request.signal,
  };
}

function getTimeoutSeconds(request: Request) {
  return (Number(request.headers.get("timeout")) || 60);
}

function getDepth(request: Request) {
  return Number(request.headers.get("depth") ?? 0);
}
