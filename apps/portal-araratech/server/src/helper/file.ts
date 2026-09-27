import { promises as fsPromises } from "fs";

export const line: Record<string, any> = {};

interface LineRemoveOptions {
  path: string;
  str: string;
}

// Remove a line from a file after str
line.remove = async function ({ path, str }: LineRemoveOptions) {
  let file: any = await fsPromises.readFile(path, "utf8");
  file = file.split("\n");

  const index = file.findIndex((x) => x.includes(str));
  if (index < 0) throw { message: `${str} is not present in ${path}` };

  file.splice(index, 1);
  file = file.join("\n");
  return await fsPromises.writeFile(path, file, "utf8");
};

interface LineInsertOptions {
  path: string;
  lines: { find: string; insert: string }[];
}

// Insert lines in a file after a str index
line.insert = async function ({ path, lines }: LineInsertOptions) {
  let file: any = await fsPromises.readFile(path, "utf8");
  file = file.split("\n");

  lines.forEach((line) => {
    const index = file.findIndex((x) => x.includes(line.find));
    if (index < 0) throw { message: `${line.find} is not present in ${path}` };
    file.splice(index + 1, 0, line.insert);
  });

  file = file.join("\n");
  return await fsPromises.writeFile(path, file, "utf8");
};

interface ReplaceOptions {
  path: string;
  find: string;
  replace: string;
}

// Replace a str in a file
export const replace = async function ({
  path,
  find,
  replace,
}: ReplaceOptions) {
  let file = await fsPromises.readFile(path, "utf8");
  file = file.replace(find, replace);
  await fsPromises.writeFile(path, file, "utf8");
};

// Delete a file if it exists
export const deleteFile = async function (path: string) {
  try {
    await fsPromises.access(path);
    fsPromises.unlink(path);
  } catch (err) {
    // do nothing
  }
};
