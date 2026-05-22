import type { WebDavCommand } from "../protocol/command.ts";
import type { ResponseModel } from "../protocol/response-model.ts";
import type { ResourceStore } from "../storage/resource-store.ts";

export type ResourceCommand = Extract<
  WebDavCommand,
  {
    type:
      | "list"
      | "read"
      | "head"
      | "write"
      | "delete"
      | "makeCollection"
      | "unknown";
  }
>;

export type CommandContext = {
  store: ResourceStore;
};

export async function runCommand(
  command: ResourceCommand,
  { store }: CommandContext,
): Promise<ResponseModel> {
  try {
    switch (command.type) {
      case "list":
        return {
          type: "multistatus",
          resources: await store.list(command.path, { recursive: command.depth !== 0 }),
        };
      case "read": {
        const resource = await store.read(command.path);
        return {
          type: "body",
          status: 200,
          body: resource.body,
          headers: { "Content-Type": "application/octet-stream" },
        };
      }
      case "head": {
        const stat = await store.stat(command.path);
        return {
          type: "empty",
          status: 200,
          headers: {
            "Content-Length": stat.size.toString(),
            "Content-Type": "application/octet-stream",
          },
        };
      }
      case "write": {
        const result = await store.write({
          path: command.path,
          body: command.body,
          mtimeSeconds: command.mtimeSeconds,
          signal: command.signal,
        });
        return { type: "empty", status: 200, headers: result.headers };
      }
      case "delete":
        await store.delete(command.path);
        return { type: "empty", status: 204 };
      case "makeCollection":
        return {
          type: "multistatus",
          resources: await store.makeCollection(command.path),
        };
      case "unknown":
        return {
          type: "body",
          status: 405,
          statusText: "Method Not Allowed",
          body: `Unknown method: ${command.method}`,
          headers: { "Content-Type": "text/plain" },
        };
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { type: "empty", status: 404 };
    }
    if (error instanceof Deno.errors.AlreadyExists) {
      return {
        type: "body",
        status: 405,
        body:
          '<d:error xmlns:d="DAV:" xmlns:td="http://dav.tampermonkey.net/ns"><td:exception>MethodNotAllowed</td:exception><td:message>The resource you tried to create already exists</td:message></d:error>',
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      };
    }
    if (typeof error === "object" && error && "code" in error && error.code === "EISDIR") {
      return { type: "body", status: 400, body: "It is a directory" };
    }
    if (command.type === "makeCollection") {
      return { type: "body", status: 422, body: `${error}` };
    }
    throw error;
  }
}
