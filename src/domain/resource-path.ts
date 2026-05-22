export type ResourcePath = {
  pathname: string;
  rootEscaped?: boolean;
};

export function toResourcePath(url: URL | string): ResourcePath {
  const parsed = new URL(url);
  const rawPathname = typeof url === "string" ? extractRawPathname(url) : parsed.pathname;
  const path: ResourcePath = { pathname: parsed.pathname };
  if (hasRootEscape(rawPathname)) {
    path.rootEscaped = true;
  }
  return path;
}

function extractRawPathname(url: string) {
  const match = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/[^/]*(?<pathname>[^?#]*)/.exec(url);
  return match?.groups?.pathname || "/";
}

function hasRootEscape(pathname: string) {
  return safeDecode(pathname).split(/[\\/]+/).includes("..");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
