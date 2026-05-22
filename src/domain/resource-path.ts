export type ResourcePath = {
  pathname: string;
};

export function toResourcePath(url: URL): ResourcePath {
  return { pathname: url.pathname };
}
