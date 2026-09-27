import * as fs from "fs/promises";

interface LineRemoveOptions {
  path: string;
  str: string;
}

interface LineInsertOptions {
  path: string;
  lines: { find: string; insert: string }[];
}

interface ReplaceOptions {
  path: string;
  find: string | RegExp;
  replace: string;
}

export const line = {
  remove: async function ({ path, str }: LineRemoveOptions): Promise<void> {
    let file: string = await fs.readFile(path, "utf8");
    let lines: string[] = file.split("\n");

    const index: number = lines.findIndex((x) => x.includes(str));
    if (index < 0) throw new Error(`${str} is not present in ${path}`);

    lines.splice(index, 1);
    file = lines.join("\n");
    await fs.writeFile(path, file, "utf8");
  },

  insert: async function ({ path, lines }: LineInsertOptions): Promise<void> {
    let file: string = await fs.readFile(path, "utf8");
    let fileLines: string[] = file.split("\n");

    lines.forEach((line) => {
      const index: number = fileLines.findIndex((x) => x.includes(line.find));
      if (index < 0) throw new Error(`${line.find} is not present in ${path}`);
      fileLines.splice(index + 1, 0, line.insert);
    });

    file = fileLines.join("\n");
    await fs.writeFile(path, file, "utf8");
  },

  replace: async function ({ path, find, replace }: ReplaceOptions): Promise<void> {
    let file: string = await fs.readFile(path, "utf8");
    file = file.replace(find, replace);
    await fs.writeFile(path, file, "utf8");
  },

  delete: async function (path: string): Promise<void> {
    try {
      await fs.access(path);
      await fs.unlink(path);
    } catch (err) {
      // do nothing
    }
  },
};