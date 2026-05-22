import type { ResourcePath } from "../domain/resource-path.ts";
import type { MultistatusResource } from "../protocol/webdav-xml.ts";

export type ResourceStore = {
  list(
    path: ResourcePath,
    options: { recursive: boolean },
  ): Promise<MultistatusResource[]>;
  read(path: ResourcePath): Promise<{ body: ReadableStream<Uint8Array> }>;
  stat(path: ResourcePath): Promise<Deno.FileInfo>;
  write(input: {
    path: ResourcePath;
    body: ReadableStream<Uint8Array> | null;
    mtimeSeconds?: number;
    signal: AbortSignal;
  }): Promise<{ headers: HeadersInit }>;
  delete(path: ResourcePath): Promise<void>;
  makeCollection(path: ResourcePath): Promise<MultistatusResource[]>;
};
