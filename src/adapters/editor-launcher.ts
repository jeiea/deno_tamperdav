import { open } from "@opensrc/deno-open";

export type EditorLauncher = (path: string, options: { app: string }) => void | Promise<void>;

export const launchEditor: EditorLauncher = (path, { app }) => {
  open(path, { app });
};
