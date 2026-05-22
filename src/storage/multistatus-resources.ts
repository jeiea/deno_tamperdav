import { toFileUrl } from "@std/path/to-file-url";
import type { MultistatusResource } from "../protocol/webdav-xml.ts";

export async function filesToMultistatusResources(
  { root, files }: {
    root: string;
    files: string[];
  },
): Promise<MultistatusResource[]> {
  const stats = await Promise.all(files.map((file) => Deno.stat(file).catch(() => null)));
  const rootUrl = `${toFileUrl(root)}`;
  return files.map((file, index) => {
    const stat = stats[index];
    return {
      href: `${toFileUrl(file)}`.slice(rootUrl.length) || "/",
      lastModified: new Date(stat?.mtime || Date.now()),
      size: stat?.size ?? -1,
      isCollection: stat?.isDirectory ?? false,
    };
  });
}
