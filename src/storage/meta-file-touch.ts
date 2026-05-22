import { resolve } from "@std/path";

export type MetaFileToucher = (
  relativePaths: string[],
  options: { root: string; date: Date },
) => Promise<string[]>;

export const touchMetaFiles: MetaFileToucher = async (relativePaths, { root, date }) => {
  const touched: string[] = [];
  for (const relativePath of relativePaths) {
    try {
      const meta = relativePath.replace(".user.js", ".meta.json");
      const absolute = resolve(root, meta);
      await Deno.utime(absolute, date, date);
      touched.push(meta);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        continue;
      }
      throw error;
    }
  }
  return touched;
};
