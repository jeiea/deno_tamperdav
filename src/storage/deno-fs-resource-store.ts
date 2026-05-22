import { expandGlob } from "@std/fs";
import { isAbsolute, relative, resolve } from "@std/path";
import { toFileUrl } from "@std/path/to-file-url";
import type { ResourcePath } from "../domain/resource-path.ts";
import type { MultistatusResource } from "../protocol/webdav-xml.ts";
import type { ResourceStore } from "./resource-store.ts";

export function createDenoFsResourceStore(root: string): ResourceStore {
  const absoluteRoot = resolve(root);

  return {
    async list(path, { recursive }) {
      const target = resolveResourcePath(absoluteRoot, path);
      const files = await Array.fromAsync(expandGlob(`${target}${recursive ? "/**" : ""}`));
      return await filesToResources({ root: absoluteRoot, files: files.map((file) => file.path) });
    },

    async read(path) {
      const filePath = resolveResourcePath(absoluteRoot, path);
      const stat = await Deno.stat(filePath);
      if (stat.isDirectory) {
        throw Object.assign(new Error("It is a directory"), { code: "EISDIR" });
      }

      const file = await Deno.open(filePath);
      return { body: file.readable };
    },

    stat(path) {
      return Deno.stat(resolveResourcePath(absoluteRoot, path));
    },

    async write({ path, body, mtimeSeconds, signal }) {
      const filePath = resolveResourcePath(absoluteRoot, path);
      const file = await Deno.open(filePath, {
        create: true,
        truncate: true,
        write: true,
      });
      await body?.pipeTo(file.writable, { signal });

      const headers = {} as Record<string, string>;
      if (mtimeSeconds !== undefined) {
        const date = new Date(Math.floor(mtimeSeconds * 1000));
        await Deno.utime(filePath, date, date);
        headers["X-OC-Mtime"] = "accepted";
      }
      return { headers };
    },

    delete(path) {
      return Deno.remove(resolveResourcePath(absoluteRoot, path));
    },

    async makeCollection(path) {
      await Deno.mkdir(resolveResourcePath(absoluteRoot, path));
      return await this.list(path, { recursive: true });
    },
  };
}

function resolveResourcePath(root: string, path: ResourcePath) {
  const target = resolve(root, `.${path.pathname}`);
  const relativePath = relative(root, target);
  if (
    path.rootEscaped ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\") ||
    isAbsolute(relativePath)
  ) {
    throw new Deno.errors.NotFound("Resource path escapes root");
  }
  return target;
}

async function filesToResources(
  { root, files }: {
    root: string;
    files: string[];
  },
): Promise<MultistatusResource[]> {
  const stats = await Promise.all(files.map((file) => Deno.stat(file).catch(() => null)));
  const rootUrl = `${toFileUrl(root)}`;
  return files.map((file, index) => fileToResource({ file, rootUrl, stat: stats[index] ?? null }));
}

function fileToResource(
  { file, rootUrl, stat }: {
    file: string;
    rootUrl: string;
    stat: Deno.FileInfo | null;
  },
): MultistatusResource {
  return {
    href: `${toFileUrl(file)}`.slice(rootUrl.length) || "/",
    lastModified: new Date(stat?.mtime || Date.now()),
    size: stat?.size ?? -1,
    isCollection: stat?.isDirectory ?? false,
  };
}
