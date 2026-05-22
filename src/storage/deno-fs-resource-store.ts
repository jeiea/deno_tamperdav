import { expandGlob } from "@std/fs";
import { join, resolve } from "@std/path";
import { toFileUrl } from "@std/path/to-file-url";
import type { MultistatusResource } from "../protocol/webdav-xml.ts";
import type { ResourceStore } from "./resource-store.ts";

export function createDenoFsResourceStore(root: string): ResourceStore {
  return {
    async list(path, { recursive }) {
      const target = resolve(root, `.${path.pathname}`);
      const files = await Array.fromAsync(expandGlob(`${target}${recursive ? "/**" : ""}`));
      return await filesToResources({ root, files: files.map((file) => file.path) });
    },

    async read(path) {
      // TODO: confirm whether this behavior is still required for Tampermonkey compatibility.
      const file = await Deno.open(resolve(`${root}${path.pathname}`));
      return { body: file.readable };
    },

    stat(path) {
      return Deno.stat(join(root, path.pathname));
    },

    async write({ path, body, mtimeSeconds, signal }) {
      const filePath = join(root, path.pathname);
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
      return Deno.remove(join(root, path.pathname));
    },

    async makeCollection(path) {
      await Deno.mkdir(join(root, path.pathname));
      return await this.list(path, { recursive: true });
    },
  };
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
