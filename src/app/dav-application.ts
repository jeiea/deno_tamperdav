import { join, resolve } from "@std/path";
import type { EditorLauncher } from "../adapters/editor-launcher.ts";
import { runCommand } from "./command-runner.ts";
import {
  decideSubscribe,
  recordChangedSubscribeResponse,
  recordGet,
  type TampermonkeySubscriptionState,
} from "../compatibility/tampermonkey-subscription.ts";
import type { ResourcePath } from "../domain/resource-path.ts";
import type { WebDavCommand } from "../protocol/command.ts";
import type { ResponseModel } from "../protocol/response-model.ts";
import type { MetaFileToucher } from "../storage/meta-file-touch.ts";
import { touchMetaFiles } from "../storage/meta-file-touch.ts";
import { filesToMultistatusResources } from "../storage/multistatus-resources.ts";
import type { ResourceStore } from "../storage/resource-store.ts";
import type { Subscriber, SubscriptionRequest } from "../subscription/subscriber.ts";

export type DavApplicationContext = {
  root: string;
  store: ResourceStore;
  subscriber: Subscriber;
  compatibility: TampermonkeySubscriptionState;
  metaTouch: boolean;
  openInEditor?: string | boolean;
  os?: typeof Deno.build.os;
  now?: () => Date;
  launchEditor?: EditorLauncher;
  touchMeta?: MetaFileToucher;
};

export async function runDavApplicationCommand(
  command: WebDavCommand,
  context: DavApplicationContext,
): Promise<ResponseModel> {
  switch (command.type) {
    case "options":
      return optionsModel(!!context.openInEditor);
    case "read":
      recordGet(context.compatibility);
      return await runCommand(command, context);
    case "subscribe":
      return await runSubscribeCommand(command, context);
    case "openEditor":
      return await runOpenEditorCommand(command, context);
    case "list":
    case "head":
    case "write":
    case "makeCollection":
    case "delete":
    case "unknown":
      return await runCommand(command, context);
  }
}

function optionsModel(openInEditor: boolean): ResponseModel {
  const allowedMethods = [
    "GET",
    "HEAD",
    "OPTIONS",
    "PUT",
    "PROPFIND",
    "MKCOL",
    "DELETE",
    "SUBSCRIBE",
    ...(openInEditor ? ["EDITOR"] : []),
  ].join(",");

  return {
    type: "empty",
    status: 200,
    headers: {
      "Access-Control-Allow-Methods": allowedMethods,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        "Authorization,User-Agent,Content-Type,Accept,Origin,X-Requested-With,Cursor",
    },
  };
}

async function runSubscribeCommand(
  command: Extract<WebDavCommand, { type: "subscribe" }>,
  context: DavApplicationContext,
): Promise<ResponseModel> {
  const now = context.now?.() ?? new Date();
  const subscription: SubscriptionRequest = {
    path: toSubscriptionPath(command.path),
    depth: command.depth,
    timeoutSeconds: command.timeoutSeconds,
    signal: command.signal,
  };

  const decision = decideSubscribe(context.compatibility, { nowMillis: now.getTime() });
  if (decision.type === "empty") {
    subscription.timeoutSeconds = 0;
  } else if (decision.type === "refresh") {
    return await runCommand(
      { type: "list", path: command.path, depth: command.refreshDepth },
      context,
    );
  } else {
    subscription.timeoutSeconds = decision.timeoutSeconds;
  }

  try {
    let relatives: string[] = [];
    do {
      relatives = [...await context.subscriber.subscribe(subscription)];

      if (relatives.length === 0) {
        return { type: "empty", status: 204 };
      }
    } while (relatives.every((path) => path.endsWith(".meta.json")));

    if (context.metaTouch) {
      const touchMeta = context.touchMeta ?? touchMetaFiles;
      relatives.push(...await touchMeta(relatives, { root: context.root, date: now }));
    }

    const absolutes = relatives.map((path) => resolve(context.root, path));

    recordChangedSubscribeResponse(context.compatibility);
    return {
      type: "multistatus",
      resources: await filesToMultistatusResources({ root: context.root, files: absolutes }),
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { type: "empty", status: 404 };
    }
    throw error;
  }
}

async function runOpenEditorCommand(
  command: Extract<WebDavCommand, { type: "openEditor" }>,
  context: DavApplicationContext,
): Promise<ResponseModel> {
  const editor = resolveEditor(context.openInEditor, context.os ?? Deno.build.os);
  if (!editor) {
    return { type: "empty", status: 501 };
  }

  try {
    await context.store.stat(command.path);
    const path = join(context.root, command.path.pathname);
    await context.launchEditor?.(resolve(path), { app: editor });
    return {
      type: "empty",
      status: 302,
      headers: {
        Location: `dav://${command.host}${command.path.pathname}`,
      },
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { type: "empty", status: 404 };
    }
    throw error;
  }
}

function resolveEditor(editor: string | boolean | undefined, os: typeof Deno.build.os) {
  if (!editor) {
    return undefined;
  }
  if (editor !== true) {
    return editor;
  }
  return os === "windows" ? "notepad" : "xdg-open";
}

function toSubscriptionPath(path: ResourcePath) {
  return path.pathname.replace(/^\/+|\/+$/g, "") || ".";
}
