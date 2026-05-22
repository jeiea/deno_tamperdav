import { resolve } from "@std/path/resolve";
import { RequestDebugLogger } from "./adapters/debug-log.ts";
import { launchEditor } from "./adapters/editor-launcher.ts";
import { runDavApplicationCommand } from "./app/dav-application.ts";
import {
  createTampermonkeySubscriptionState,
  type TampermonkeySubscriptionState,
} from "./compatibility/tampermonkey-subscription.ts";
import { isAuthorized } from "./protocol/basic-auth.ts";
import { parseWebDavCommand } from "./protocol/command.ts";
import { renderHttpResponse } from "./protocol/http-response.ts";
import { createDenoFsResourceStore } from "./storage/deno-fs-resource-store.ts";
import { FsSubscriber } from "./subscription/fs-subscriber.ts";

export type DavServerOptions = {
  debug?: boolean;
  verbose?: boolean;
  username?: string;
  password?: string;
  "open-in-editor"?: string | boolean;
  "meta-touch"?: boolean;
};

export class DavServer implements Disposable {
  #root: string;
  #subscriber: FsSubscriber;
  #compatibility: TampermonkeySubscriptionState;
  #debugLogger?: RequestDebugLogger;

  constructor(root: string, private readonly args: DavServerOptions) {
    this.#root = resolve(root);
    this.#subscriber = new FsSubscriber(this.#root);
    this.#compatibility = createTampermonkeySubscriptionState();
    this.#debugLogger = args.debug ? new RequestDebugLogger({ verbose: args.verbose }) : undefined;
  }

  logAndHandleRequest = async (request: Request): Promise<Response> => {
    let response: Response;
    try {
      const responsePromise = this.#handleRequest(request);

      this.#debugLogger?.log(request, responsePromise);

      response = await responsePromise;
    } catch (error) {
      response = renderHttpResponse({
        type: "body",
        status: 500,
        body: `${error}`,
      });
    }

    return response;
  };

  [Symbol.dispose](): void {
    this.#subscriber[Symbol.dispose]();
  }

  #handleRequest = async (request: Request): Promise<Response> => {
    if (!isAuthorized(request, this.args)) {
      return renderHttpResponse({
        type: "body",
        status: 401,
        body: "Unauthorized",
        headers: { "WWW-Authenticate": 'Basic realm="Enter credentials"' },
      });
    }

    const response = await this.#handle(request);
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, post-check=0, pre-check=0",
    );
    response.headers.set("DAV", "1");
    return response;
  };

  #handle = async (request: Request): Promise<Response> => {
    const command = parseWebDavCommand(request);
    const model = await runDavApplicationCommand(command, {
      root: this.#root,
      store: createDenoFsResourceStore(this.#root),
      subscriber: this.#subscriber,
      metaTouch: !!this.args["meta-touch"],
      compatibility: this.#compatibility,
      openInEditor: this.args["open-in-editor"],
      launchEditor,
    });
    return renderHttpResponse(model);
  };
}
