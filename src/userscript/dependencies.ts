import { expandGlob } from "@std/fs";
import { join as joinPath, relative, resolve } from "@std/path";
import { dirname, join, normalize } from "@std/path/posix";
import { extract } from "@jeiea/userscript-metadata";

type RewriteOptions = {
  root: string;
  scriptPathname: string;
  origin: string;
};

type FindDependentOptions = {
  root: string;
  changedPaths: Iterable<string>;
};

type Dependency = {
  path: string;
};

const CACHE_PARAMETER = "tdv";

export async function rewriteUserscriptDependencyUrls(
  code: string,
  options: RewriteOptions,
): Promise<string> {
  if (!extract(code)) {
    return code;
  }

  const lines = code.split(/(\r?\n)/);
  const scriptDirectory = dirname(options.scriptPathname);
  let inMetadata = false;

  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }

    if (line.trim() === "// ==UserScript==") {
      inMetadata = true;
      continue;
    }
    if (line.trim() === "// ==/UserScript==") {
      break;
    }
    if (!inMetadata) {
      continue;
    }

    lines[index] = await rewriteMetadataLine(line, { ...options, scriptDirectory });
  }

  return lines.join("");
}

export async function findDependentUserscripts(
  { root, changedPaths }: FindDependentOptions,
): Promise<Set<string>> {
  const absoluteRoot = resolve(root);
  const normalizedChanges = new Set([...changedPaths].map(normalizeRelativePath));
  const dependents = new Set<string>();

  for await (const file of expandGlob(joinPath(absoluteRoot, "**/*.user.js"))) {
    if (!file.isFile) {
      continue;
    }

    const code = await Deno.readTextFile(file.path);
    const scriptPath = normalizeRelativePath(relative(absoluteRoot, file.path));
    const dependencies = extractRelativeDependencies(code, `/${scriptPath}`);
    if (dependencies.some((dependency) => normalizedChanges.has(dependency.path))) {
      dependents.add(scriptPath);
    }
  }

  return dependents;
}

function extractRelativeDependencies(code: string, scriptPathname: string): Dependency[] {
  const metadata = extract(code);
  if (!metadata) {
    return [];
  }

  const scriptDirectory = dirname(scriptPathname);
  const requires = (metadata["@require"] ?? []).flatMap((value) =>
    relativeDependencyPaths(value, scriptDirectory)
  );
  const resources = (metadata["@resource"] ?? []).flatMap((value) => {
    const url = value.trim().split(/\s+/)[1];
    return url ? relativeDependencyPaths(url, scriptDirectory) : [];
  });

  return [...requires, ...resources];
}

async function rewriteMetadataLine(
  line: string,
  options: RewriteOptions & { scriptDirectory: string },
) {
  const requireMatch = /^(\s*\/\/\s*@require\s+)(\S+)(.*)$/.exec(line);
  if (requireMatch) {
    const [, prefix, url, suffix] = requireMatch;
    const rewritten = await rewriteRelativeUrl(url!, options);
    return rewritten ? `${prefix}${rewritten}${suffix}` : line;
  }

  const resourceMatch = /^(\s*\/\/\s*@resource\s+\S+\s+)(\S+)(.*)$/.exec(line);
  if (resourceMatch) {
    const [, prefix, url, suffix] = resourceMatch;
    const rewritten = await rewriteRelativeUrl(url!, options);
    return rewritten ? `${prefix}${rewritten}${suffix}` : line;
  }

  return line;
}

async function rewriteRelativeUrl(
  value: string,
  { root, scriptDirectory, origin }: RewriteOptions & { scriptDirectory: string },
) {
  const path = relativeDependencyPaths(value, scriptDirectory)[0];
  if (!path) {
    return;
  }

  const url = new URL(path.path, withTrailingSlash(origin));
  const original = new URL(value, "http://relative.local");
  for (const [key, parameter] of original.searchParams) {
    if (key !== CACHE_PARAMETER) {
      url.searchParams.append(key, parameter);
    }
  }
  url.searchParams.set(CACHE_PARAMETER, `${await dependencyVersion(root, path.path)}`);
  url.hash = original.hash;
  return url.toString();
}

function relativeDependencyPaths(value: string, scriptDirectory: string): Dependency[] {
  if (!isRelativeUrl(value)) {
    return [];
  }

  const [pathPart = ""] = value.split(/[?#]/, 1);
  const path = normalizeRelativePath(join(scriptDirectory, decodeURIComponent(pathPart)));
  return [{ path }];
}

function isRelativeUrl(value: string) {
  return !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) && !value.startsWith("//") &&
    !value.startsWith("/");
}

async function dependencyVersion(root: string, path: string) {
  try {
    const stat = await Deno.stat(resolve(root, path));
    return stat.mtime?.getTime() ?? 0;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return 0;
    }
    throw error;
  }
}

function normalizeRelativePath(path: string) {
  return normalize(path).replace(/\\/g, "/").replace(/^\/+/, "");
}

function withTrailingSlash(origin: string) {
  return origin.endsWith("/") ? origin : `${origin}/`;
}
