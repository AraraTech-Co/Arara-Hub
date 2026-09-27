import Cryptr from "cryptr";
import prisma from "../../prisma";
import Model from "../Model";
import { IToken } from "./IToken";

const crypto = new Cryptr(process.env.CRYPTO_SECRET as string);

export class Token extends Model<IToken> {
  constructor() {
    super(prisma.token as never);
  }

  public custom = {
    save: {
      save: async ({
        provider,
        data,
        user,
      }: {
        provider: string;
        data: Record<string, unknown>;
        user: string;
      }) => {
        const tokenData: Record<string, unknown> = { ...data };
        if (tokenData.access) {
          tokenData.access = crypto.encrypt(tokenData.access as string);
        }
        if (tokenData.refresh) {
          tokenData.refresh = crypto.encrypt(tokenData.refresh as string);
        }

        const existing = await prisma.token.findFirst({
          where: { provider, userId: user },
        });

        if (existing) {
          await prisma.token.update({
            where: { id: existing.id },
            data: {
              jwt: tokenData.jwt as string,
              access: tokenData.access as string,
              refresh: tokenData.refresh as string,
            },
          });
        } else {
          await this.create.new({
            provider,
            jwt: tokenData.jwt as string,
            access: tokenData.access as string,
            refresh: tokenData.refresh as string,
            userId: user,
          } as Partial<IToken>);
        }

        return data;
      },
    },
    get: {
      get: async ({
        id,
        provider,
        user,
        skipDecryption,
      }: {
        id?: string;
        provider?: string;
        user: string;
        skipDecryption?: boolean;
      }) => {
        const data = await prisma.token.findMany({
          where: {
            userId: user,
            ...(id && { id }),
            ...(provider && { provider }),
          },
        });

        if (data.length && !skipDecryption) {
          return data.map((token) => ({
            ...token,
            user_id: token.userId,
            access: token.access ? crypto.decrypt(token.access) : null,
            refresh: token.refresh ? crypto.decrypt(token.refresh) : null,
          }));
        }

        return data.map((t) => ({ ...t, user_id: t.userId }));
      },
    },
    verify: {
      verify: async ({
        provider,
        user,
      }: {
        provider: string;
        user: string;
      }) => {
        const count = await prisma.token.count({
          where: { userId: user, provider },
        });
        return count > 0;
      },
    },
    delete: {
      token: async ({
        id,
        provider,
        user,
      }: {
        id?: string;
        provider?: string;
        user: string;
      }) => {
        return await prisma.token.deleteMany({
          where: {
            userId: user,
            ...(provider && { provider }),
            ...(id && { id }),
          },
        });
      },
    },
  };
}
