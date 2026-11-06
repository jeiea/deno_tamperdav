import { extract } from "@jeiea/userscript-metadata";
import { exists } from "@std/fs/exists";
import { join } from "@std/path";

export async function reconcileStartupScripts(root: string) {
  const directory = join(root, "Tampermonkey", "sync");
  const entries = await readSyncDirectory(root);

  await createMissingMetadata(directory, entries);
  await removeDeletedScripts(directory, entries);
}

export function isMetadataRemoved(content: string) {
  const meta: unknown = JSON.parse(content);
  if (!isRecord(meta) || (meta.options !== undefined && !isRecord(meta.options))) {
    throw new Error("Metadata and options must be objects");
  }
  return Boolean(meta.options?.removed);
}

async function createMissingMetadata(directory: string, entries: Deno.DirEntry[]) {
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith(".user.js")) continue;
    const uuid = entry.name.slice(0, -".user.js".length);
    const metaPath = join(directory, `${uuid}.meta.json`);
    if (await exists(metaPath)) continue;

    await createMetadata(join(directory, entry.name), { uuid, metaPath });
  }
}

async function removeDeletedScripts(directory: string, entries: Deno.DirEntry[]) {
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith(".meta.json")) continue;
    const metaPath = join(directory, entry.name);
    if (!await readRemovalMarker(metaPath)) continue;

    const scriptPath = join(directory, entry.name.slice(0, -".meta.json".length) + ".user.js");
    if (await exists(scriptPath)) {
      await Deno.remove(scriptPath);
    }
    await Deno.remove(metaPath);
  }
}

async function readSyncDirectory(root: string) {
  const directory = join(root, "Tampermonkey", "sync");
  try {
    for (const path of [join(root, "Tampermonkey"), directory]) {
      if (!(await Deno.lstat(path)).isDirectory) {
        throw new Error(`Startup reconciliation requires a directory, not a link or file: ${path}`);
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }

  const entries = await Array.fromAsync(Deno.readDir(directory));
  for (const entry of entries) {
    if (
      !entry.isFile &&
      (entry.name.endsWith(".meta.json") || entry.name.endsWith(".user.js"))
    ) {
      throw new Error(
        `Startup reconciliation requires a regular file: ${join(directory, entry.name)}`,
      );
    }
  }
  return entries;
}

async function readRemovalMarker(metaPath: string) {
  try {
    return isMetadataRemoved(await Deno.readTextFile(metaPath));
  } catch (cause) {
    throw new Error(`Cannot reconcile metadata: ${metaPath}`, { cause });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createMetadata(
  scriptPath: string,
  { uuid, metaPath }: { uuid: string; metaPath: string },
) {
  const code = await Deno.readTextFile(scriptPath);
  const name = extract(code)?.["@name"]?.[0]?.trim();
  if (!name) {
    throw new Error(`Cannot reconcile script without @name: ${scriptPath}`);
  }
  const stat = await Deno.stat(scriptPath);
  await Deno.writeTextFile(
    metaPath,
    JSON.stringify({
      uuid,
      name,
      options: {},
      lastModified: stat.mtime?.getTime() ?? Date.now(),
    }),
    { createNew: true },
  );
}
