import { v4 as uuidv4 } from "uuid";
import prisma from "../../prisma/client";

export const create = async function(data: Record<string, unknown>, account: string) {
  const id = uuidv4();
  await prisma.{{view}}.create({
    data: { id, accountId: account, ...data },
  });
  return id;
};

export const get = async function(id: string | null, account: string) {
  return await prisma.{{view}}.findMany({
    where: {
      accountId: account,
      ...(id && { id }),
    },
  });
};

export const update = async function(
  id: string,
  data: Record<string, unknown>,
  account: string,
) {
  await prisma.{{view}}.updateMany({
    where: { id, accountId: account },
    data,
  });
  return data;
};

export const delete{{capitalisedName}} = async function(id: string, account: string) {
  await prisma.{{view}}.deleteMany({
    where: { id, accountId: account },
  });
  return id;
};
