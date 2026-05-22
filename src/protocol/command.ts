import type { ResourcePath } from "../domain/resource-path.ts";
import { toResourcePath } from "../domain/resource-path.ts";

export type WebDavCommand =
  | { type: "options"; path: ResourcePath }
  | { type: "list"; path: ResourcePath; depth: number }
  | { type: "read"; path: ResourcePath }
  | { type: "head"; path: ResourcePath }
  | {
    type: "write";
    path: ResourcePath;
    body: ReadableStream<Uint8Array> | null;
    mtimeSeconds?: number;
    signal: AbortSignal;
  }
  | { type: "makeCollection"; path: ResourcePath }
  | { type: "delete"; path: ResourcePath }
  | {
    type: "subscribe";
    path: ResourcePath;
    depth: number;
    refreshDepth: number;
    timeoutSeconds: number;
    signal: AbortSignal;
  }
  | { type: "openEditor"; path: ResourcePath; host: string | null }
  | { type: "unknown"; method: string; path: ResourcePath };

export function parseWebDavCommand(request: Request): WebDavCommand {
  const method = request.method.toUpperCase();
  const path = toResourcePath(new URL(request.url));

  switch (method) {
    case "OPTIONS":
      return { type: "options", path };
    case "PROPFIND":
      return { type: "list", path, depth: Number(request.headers.get("depth") ?? 1) };
    case "GET":
      return { type: "read", path };
    case "HEAD":
      return { type: "head", path };
    case "PUT":
      return {
        type: "write",
        path,
        body: request.body,
        mtimeSeconds: getMtimeSeconds(request),
        signal: request.signal,
      };
    case "MKCOL":
      return { type: "makeCollection", path };
    case "DELETE":
      return { type: "delete", path };
    case "SUBSCRIBE":
      return {
        type: "subscribe",
        path,
        depth: Number(request.headers.get("depth") ?? 0),
        refreshDepth: Number(request.headers.get("depth") ?? 1),
        timeoutSeconds: Number(request.headers.get("timeout")) || 60,
        signal: request.signal,
      };
    case "EDITOR":
      return { type: "openEditor", path, host: request.headers.get("host") };
    default:
      return { type: "unknown", method, path };
  }
}

function getMtimeSeconds(request: Request) {
  const value = request.headers.get("x-oc-mtime");
  return value ? Number(value) : undefined;
}
