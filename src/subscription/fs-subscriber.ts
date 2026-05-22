import { debounce } from "@std/async/debounce";
import { relative, resolve } from "@std/path";
import { filterChangedPaths } from "./change-filter.ts";
import type { Subscriber, SubscriptionRequest } from "./subscriber.ts";

export class FsSubscriber implements Subscriber {
  readonly #root: string;

  readonly #changes = new Set<string>();
  readonly #requests = new Set<SubscriptionRequest>();
  readonly #resolvers = new Map<SubscriptionRequest, PromiseWithResolvers<Set<string>>>();
  readonly #watchers = new Map<string, Deno.FsWatcher>();

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async subscribe(request: SubscriptionRequest): Promise<Set<string>> {
    const { path, timeoutSeconds, depth, signal } = request;

    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }

    signal.addEventListener("abort", () => {
      this.#resolvers.get(request)?.reject(signal.reason);
    });

    this.#requests.add(request);
    const resolver = Promise.withResolvers<Set<string>>();
    this.#resolvers.set(request, resolver);

    const timeoutId = setTimeout(() => {
      resolver.resolve(new Set());
    }, timeoutSeconds * 1000);

    this.#watch(path, { recursive: depth === 0 });

    try {
      return await resolver.promise;
    } finally {
      clearTimeout(timeoutId);
      this.#resolvers.delete(request);
      this.#requests.delete(request);
    }
  }

  [Symbol.dispose](): void {
    this.#changes.clear();
    this.#requests.clear();
    this.#notify.clear();

    const error = new Error("aborted");
    for (const resolver of this.#resolvers.values()) {
      resolver.reject(error);
    }
    this.#resolvers.clear();

    for (const watcher of this.#watchers.values()) {
      watcher.close();
    }
    this.#watchers.clear();
  }

  async #watch(path: string, { recursive }: { recursive: boolean }) {
    const id = `${path}-${recursive ? "/**" : ""}`;
    if (this.#watchers.has(id)) {
      return;
    }

    const target = resolve(this.#root, path);
    const watcher = Deno.watchFs(target, { recursive });
    this.#watchers.set(id, watcher);

    const trivialKinds: Deno.FsEvent["kind"][] = ["access", "any", "other"];

    for await (const event of watcher) {
      if (trivialKinds.includes(event.kind)) {
        continue;
      }

      for (const path of event.paths) {
        const relativePath = relative(this.#root, path).replace(/\\/g, "/");
        this.#changes.add(relativePath);
      }

      this.#notify();
    }
  }

  #notify = debounce(() => {
    if (this.#changes.size === 0) {
      return;
    }

    for (const request of this.#requests) {
      const paths = filterChangedPaths({
        requestedPath: request.path,
        changedPaths: this.#changes,
      });

      const resolver = this.#resolvers.get(request);
      if (!resolver || paths.size === 0) {
        continue;
      }

      resolver.resolve(paths);
    }

    this.#changes.clear();
  }, 500);
}
