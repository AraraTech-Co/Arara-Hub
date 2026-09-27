import { v4 as uuidv4 } from "uuid";
import prisma from "../../prisma";
import { IAccount } from "./IAccount";

export const schema = { name: "Account" };

interface CreateAccountInput {
  name?: string;
  plan?: string;
}

export const create = async function (
  account: CreateAccountInput,
): Promise<IAccount> {
  const data = {
    id: uuidv4(),
    active: true,
    name: account.name || "My Account",
    plan: account.plan || "free",
    dateCreated: new Date(),
  };

  await prisma.account.create({ data });
  return {
    id: data.id,
    active: data.active,
    name: data.name,
    plan: data.plan,
    date_created: data.dateCreated,
  };
};

interface GetAccountOutput {
  id: string;
  email?: string;
  plan?: string;
  active: boolean;
  date_created: Date;
}

export const get = async function (): Promise<GetAccountOutput[]> {
  const accounts = await prisma.account.findMany({
    include: {
      accountUsers: {
        where: { permission: { in: ["owner", "master"] } },
        include: { user: { select: { email: true } } },
      },
    },
  });

  return accounts.map((a) => ({
    id: a.id,
    email: a.accountUsers[0]?.user.email,
    plan: a.plan || undefined,
    active: a.active,
    date_created: a.dateCreated,
  }));
};
