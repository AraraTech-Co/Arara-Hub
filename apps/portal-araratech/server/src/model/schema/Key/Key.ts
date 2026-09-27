import prisma from "../../prisma";
import * as utility from "../../../helper/utility";
import Model from "../Model";
import { IKey } from "./IKey";

export class Key extends Model<IKey> {
  constructor() {
    super(prisma.apiKey as never);
  }

  public custom = {
    create: {
      create: async ({
        data,
        account,
      }: {
        data: Partial<IKey> | Record<string, unknown>;
        account: string;
      }) => {
        const keyData = {
          ...(data as Record<string, unknown>),
          active: true,
          accountId: account,
          dateCreated: new Date(),
          scope: (data as Record<string, unknown>).scope || [],
        };

        await this.create.new(keyData as Partial<IKey>);

        const result = { ...data } as Record<string, unknown>;
        result.full_key = result.key;
        result.key = utility.mask(result.key as string);
        result.account_id = account;
        return result;
      },
    },
    read: {
      get: async ({
        id,
        name,
        account,
      }: {
        id?: string;
        name?: string;
        account: string;
      }) => {
        const data = await prisma.apiKey.findMany({
          where: {
            accountId: account,
            ...(id && { id }),
            ...(name && { name }),
          },
        });

        return data.map((x) => ({
          ...x,
          account_id: x.accountId,
          date_created: x.dateCreated,
          key: id ? x.key : utility.mask(x.key),
          scope: x.scope,
        }));
      },

      unique: async (key: string) => {
        const count = await prisma.apiKey.count({ where: { key } });
        return count === 0;
      },

      verify: async (key: string) => {
        const data = await prisma.apiKey.findFirst({
          where: { key, active: true },
          select: { scope: true, accountId: true },
        });

        if (!data) return false;

        return {
          scope: data.scope,
          account_id: data.accountId,
        };
      },
    },
    update: {
      update: async ({
        id,
        data,
        account,
      }: {
        id: string;
        data: Partial<IKey>;
        account: string;
      }) => {
        return await prisma.apiKey.updateMany({
          where: { id, accountId: account },
          data: data as Record<string, unknown>,
        });
      },
    },
    delete: {
      deleteKey: async ({ id, account }: { id: string; account: string }) => {
        return await prisma.apiKey.deleteMany({
          where: { id, accountId: account },
        });
      },
    },
  };
}
