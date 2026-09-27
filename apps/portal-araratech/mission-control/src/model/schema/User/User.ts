import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import prisma from "../../prisma";
import { IUser } from "./IUser";

export const schema = { name: "User" };

interface CreateUserParams {
  user: {
    name: string;
    email: string;
    password?: string;
    facebook_id?: string;
    twitter_id?: string;
  };
  account: string;
}

export const create = async function ({ user, account }: CreateUserParams) {
  const data: Record<string, unknown> = {
    id: uuidv4(),
    name: user.name,
    email: user.email,
    dateCreated: new Date(),
    lastActive: new Date(),
    supportEnabled: false,
    twoFaEnabled: false,
    facebookId: user.facebook_id,
    twitterId: user.twitter_id,
    defaultAccount: account,
  };

  if (user.password) {
    const salt = await bcrypt.genSalt(10);
    data.password = await bcrypt.hash(user.password, salt);
  }

  await prisma.user.create({ data: data as never });

  if (data.password) {
    delete data.password;
    data.has_password = true;
  }

  data.account_id = account;
  return data;
};

interface GetUserParams {
  id?: string | null;
  email?: string | null;
}

export const get = async function ({ id = null, email = null }: GetUserParams) {
  return await prisma.user.findMany({
    where: {
      ...(id && { id }),
      ...(email && { email: { equals: email, mode: "insensitive" } }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      dateCreated: true,
      lastActive: true,
      disabled: true,
      supportEnabled: true,
      twoFaEnabled: true,
      defaultAccount: true,
      facebookId: true,
      twitterId: true,
    },
  });
};

interface UpdateUserParams {
  id: string;
  data: Partial<IUser>;
}

export const update = async function ({ id, data }: UpdateUserParams) {
  const prismaData: Record<string, unknown> = {};
  if (data.name !== undefined) prismaData.name = data.name;
  if (data.email !== undefined) prismaData.email = data.email;
  if (data.disabled !== undefined) prismaData.disabled = data.disabled;

  await prisma.user.update({ where: { id }, data: prismaData });
  return data;
};

export const account = {};

interface AddAccountParams {
  id: string;
  account: string;
  permission: string;
}

export const addAccount = async function ({
  id,
  account,
  permission,
}: AddAccountParams) {
  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) throw { message: `No user with that ID` };

  return await prisma.accountUser.create({
    data: {
      accountId: account,
      userId: id,
      permission,
      onboarded: false,
    },
  });
};

export const deleteUser = async function (id: string) {
  return await prisma.user.delete({ where: { id } });
};
