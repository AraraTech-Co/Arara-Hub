import prisma from "../../prisma";
import Model from "../Model";
import { ILog } from "./ILog";

export class Log extends Model<ILog> {
  constructor() {
    super(prisma.log as never);
  }

  public custom = {
    create: {
      new: async ({
        message,
        body = null,
        req,
        user = null,
        account = null,
      }: {
        message: string;
        body?: unknown;
        req?: any;
        user?: string | null;
        account?: string | null;
      }) => {
        const route = req?.route as { path?: string; methods?: Record<string, boolean> } | undefined;

        const newLog = {
          message: message,
          time: new Date(),
          userId: (req?.user as string) || user,
          accountId: (req?.account as string) || account,
          endpoint: route?.path,
          body:
            body &&
            (typeof body === "object"
              ? JSON.stringify(body, Object.getOwnPropertyNames(body))
              : body),
          method: route?.methods
            ? Object.keys(route.methods).find((key) => route.methods![key])
            : null,
        };

        return await this.create.new(newLog as Partial<ILog>);
      },
    },
  };
}
