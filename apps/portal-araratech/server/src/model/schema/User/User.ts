import bcrypt from "bcryptjs";
import Cryptr from "cryptr";
import prisma from "../../prisma";
import Model from "../Model";
import { IUser } from "./IUser";

const crypto = new Cryptr(process.env.CRYPTO_SECRET as string);

function formatUser(
  user: Record<string, unknown>,
  accountId?: string,
  accountUser?: { permission: string; onboarded: boolean },
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    email: user.email,
    date_created: user.dateCreated,
    last_active: user.lastActive,
    disabled: user.disabled,
    support_enabled: user.supportEnabled,
    "2fa_enabled": user.twoFaEnabled,
    default_account: user.defaultAccount,
    facebook_id: user.facebookId,
    twitter_id: user.twitterId,
    has_password: user.password ? true : false,
    account_id: accountId || user.defaultAccount,
  };

  if (accountUser) {
    result.permission = accountUser.permission;
    result.onboarded = accountUser.onboarded;
  }

  return result;
}

export class User extends Model<IUser> {
  constructor() {
    super(prisma.user as never);
  }

  public custom = {
    create: {
      create: async ({ user, account }: { user: Record<string, unknown>; account: string }) => {
        const data: Record<string, unknown> = {
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
          data.password = await bcrypt.hash(user.password as string, salt);
        }

        const newUser = await this.create.new(data as Partial<IUser>);

        await prisma.accountUser.create({
          data: {
            accountId: account,
            userId: newUser.id as string,
            permission: "owner",
            onboarded: false,
          },
        });

        return formatUser(newUser as unknown as Record<string, unknown>, account, {
          permission: "owner",
          onboarded: false,
        });
      },
    },
    read: {
      get: async ({
        id,
        email,
        account,
        social,
        permission,
      }: {
        id?: string;
        email?: string;
        account?: string;
        social?: { provider: string; id: string };
        permission?: string;
      }) => {
        const where: Record<string, unknown> = {};

        if (id) where.id = id;

        if (email) {
          where.email = { equals: email, mode: "insensitive" };
        }

        if (social) {
          const socialField =
            social.provider === "facebook" ? "facebookId" : "twitterId";
          where.OR = [
            ...(email
              ? [{ email: { equals: email, mode: "insensitive" } }]
              : []),
            { [socialField]: social.id },
          ];
        }

        const accountFilter: Record<string, unknown> = {};
        if (account) accountFilter.accountId = account;
        if (permission) accountFilter.permission = permission;

        const users = await prisma.user.findMany({
          where: {
            ...where,
            ...(Object.keys(accountFilter).length && {
              accountUsers: { some: accountFilter },
            }),
          },
          include: {
            accountUsers: account
              ? { where: { accountId: account } }
              : true,
          },
        });

        if (!users.length) {
          return id || email || social ? undefined : [];
        }

        const formatted = users.map((u) => {
          const au = account
            ? u.accountUsers.find((a) => a.accountId === account)
            : u.accountUsers[0];
          return formatUser(
            u as unknown as Record<string, unknown>,
            account || u.defaultAccount,
            au
              ? { permission: au.permission, onboarded: au.onboarded }
              : undefined,
          );
        });

        return id || email || social ? formatted[0] : formatted;
      },
    },
    account: {
      get: async ({ id }: { id: string; permission?: string }) => {
        const accountUsers = await prisma.accountUser.findMany({
          where: { userId: id },
          include: { account: true },
        });

        return accountUsers.map((au) => ({
          id: au.accountId,
          user_id: id,
          permission: au.permission,
          name: au.account.name,
        }));
      },

      add: async ({
        id,
        account,
        permission,
      }: {
        id: string;
        account: string;
        permission: string;
      }) => {
        const user = await prisma.user.findFirst({ where: { id } });
        if (!user) throw { message: `No user with that ID` };

        return await prisma.accountUser.upsert({
          where: {
            accountId_userId: { accountId: account, userId: id },
          },
          create: {
            accountId: account,
            userId: id,
            permission,
            onboarded: false,
          },
          update: { permission },
        });
      },

      delete: async ({ id, account }: { id: string; account: string }) => {
        const user = await prisma.user.findFirst({ where: { id } });
        if (!user) throw { message: `No user with that ID` };

        return await prisma.accountUser.delete({
          where: {
            accountId_userId: { accountId: account, userId: id },
          },
        });
      },
    },
    password: {
      password: async ({ id, account }: { id: string; account: string }) => {
        const user = await prisma.user.findFirst({
          where: {
            id,
            accountUsers: { some: { accountId: account } },
          },
          select: { password: true },
        });
        return user;
      },

      verify: async ({
        id,
        account,
        password,
      }: {
        id: string;
        account: string;
        password: string;
      }) => {
        const data = await prisma.user.findFirst({
          where: {
            id,
            accountUsers: { some: { accountId: account } },
          },
          select: { name: true, email: true, password: true },
        });

        const verified = data?.password
          ? await bcrypt.compare(password, data.password)
          : false;

        if (!verified || !data) return false;

        return { name: data.name, email: data.email };
      },

      save: async ({ id, password }: { id: string; password: string }) => {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        return await prisma.user.update({
          where: { id },
          data: { password: hash },
        });
      },
    },
    update: {
      update: async ({
        id,
        account,
        data,
      }: {
        id: string;
        account: string;
        data: Record<string, unknown>;
      }) => {
        if (data.onboarded !== undefined || data.permission) {
          const doc = await prisma.user.findFirst({
            where: {
              id,
              accountUsers: { some: { accountId: account } },
            },
          });
          if (!doc) throw { message: `No user with that ID` };

          const accountUserUpdate: Record<string, unknown> = {};
          if (data.onboarded !== undefined) {
            accountUserUpdate.onboarded = data.onboarded;
          }
          if (data.permission) {
            accountUserUpdate.permission = data.permission;
          }

          await prisma.accountUser.update({
            where: {
              accountId_userId: { accountId: account, userId: id },
            },
            data: accountUserUpdate,
          });
        }

        const userUpdate: Record<string, unknown> = { ...data };
        delete userUpdate.onboarded;
        delete userUpdate.permission;

        if (Object.keys(userUpdate).length) {
          const prismaData: Record<string, unknown> = {};
          if (userUpdate.name !== undefined) prismaData.name = userUpdate.name;
          if (userUpdate.email !== undefined) prismaData.email = userUpdate.email;
          if (userUpdate.disabled !== undefined) prismaData.disabled = userUpdate.disabled;
          if (userUpdate.support_enabled !== undefined) {
            prismaData.supportEnabled = userUpdate.support_enabled;
          }
          if (userUpdate["2fa_enabled"] !== undefined) {
            prismaData.twoFaEnabled = userUpdate["2fa_enabled"];
          }
          if (userUpdate["2fa_secret"] !== undefined) {
            prismaData.twoFaSecret = userUpdate["2fa_secret"];
          }
          if (userUpdate.last_active !== undefined) {
            prismaData.lastActive = userUpdate.last_active;
          }
          if (userUpdate.default_account !== undefined) {
            prismaData.defaultAccount = userUpdate.default_account;
          }

          if (Object.keys(prismaData).length) {
            await prisma.user.update({ where: { id }, data: prismaData });
          }
        }

        return data;
      },
    },
    deleteUser: {
      deleteUser: async ({ id, account }: { id: string; account: string }) => {
        if (account) {
          return await prisma.accountUser.deleteMany({
            where: { userId: id, accountId: account },
          });
        }
        return await prisma.user.deleteMany({ where: { id } });
      },
    },
    "2fa": {
      secret: async ({ id, email }: { id?: string; email?: string }) => {
        const data = await prisma.user.findFirst({
          where: {
            ...(id && { id }),
            ...(email && { email: { equals: email, mode: "insensitive" } }),
          },
          select: { twoFaSecret: true },
        });

        return data?.twoFaSecret ? crypto.decrypt(data.twoFaSecret) : null;
      },
      backup: {
        save: async ({ id, code }: { id: string; code: string }) => {
          const salt = await bcrypt.genSalt(10);
          const hash = await bcrypt.hash(code, salt);
          return await prisma.user.update({
            where: { id },
            data: { twoFaBackupCode: hash },
          });
        },

        verify: async ({
          id,
          email,
          account,
          code,
        }: {
          id?: string;
          email?: string;
          account?: string;
          code: string;
        }) => {
          const data = await prisma.user.findFirst({
            where: {
              ...(id && {
                id,
                ...(account && {
                  accountUsers: { some: { accountId: account } },
                }),
              }),
              ...(email && { email: { equals: email, mode: "insensitive" } }),
            },
            select: { twoFaBackupCode: true },
          });

          return data?.twoFaBackupCode
            ? await bcrypt.compare(code, data.twoFaBackupCode)
            : false;
        },
      },
    },
  };
}
