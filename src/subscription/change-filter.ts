export function filterChangedPaths(
  { requestedPath, changedPaths }: {
    requestedPath: string;
    changedPaths: Iterable<string>;
  },
): Set<string> {
  const paths = new Set<string>();

  for (const path of changedPaths) {
    const isSubPath = path.startsWith(`${requestedPath}/`) || requestedPath === ".";
    const isNotRelated = path !== requestedPath && !isSubPath;
    if (isNotRelated) {
      continue;
    }

    paths.add(path);
  }

  return paths;
}
