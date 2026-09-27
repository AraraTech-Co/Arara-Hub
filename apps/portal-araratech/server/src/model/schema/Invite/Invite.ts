import prisma from "../../prisma";
import Model from "../Model";
import { IInvite } from "./IInvite";

export class Invite extends Model<IInvite> {
  constructor() {
    super(prisma.invite as never);
  }

  public custom = {
    create: {
      create: async ({
        email,
        permission,
        account,
      }: {
        email: string;
        permission?: string;
        account: string;
      }) => {
        const data = {
          email,
          used: false,
          permission: permission || "user",
          dateSent: new Date(),
          accountId: account,
        };

        await this.create.new(data as Partial<IInvite>);
        return {
          ...data,
          date_sent: data.dateSent,
          account_id: data.accountId,
        };
      },
    },
    read: {
      get: async ({
        id,
        email,
        account,
        returnArray,
      }: {
        id?: string;
        email?: string;
        account?: string;
        returnArray?: boolean;
      }) => {
        const data = await prisma.invite.findMany({
          where: {
            ...(id && { id }),
            ...(email && { email }),
            ...(account && { accountId: account }),
            used: false,
          },
        });

        const formatted = data.map((i) => ({
          ...i,
          date_sent: i.dateSent,
          account_id: i.accountId,
        }));

        return formatted.length
          ? returnArray
            ? formatted
            : formatted[0]
          : null;
      },
    },
    update: {
      update: async ({
        id,
        data,
      }: {
        id: string;
        data: Partial<IInvite>;
      }) => {
        const prismaData: Record<string, unknown> = {};
        if (data.used !== undefined) prismaData.used = data.used;
        if (data.permission !== undefined) prismaData.permission = data.permission;
        if (data.email !== undefined) prismaData.email = data.email;

        await prisma.invite.update({ where: { id }, data: prismaData });
        return data;
      },
    },
    delete: {
      deleteInvite: async ({
        id,
        account,
      }: {
        id: string;
        account: string;
      }) => {
        return await prisma.invite.deleteMany({
          where: { id, accountId: account },
        });
      },
    },
  };
}
