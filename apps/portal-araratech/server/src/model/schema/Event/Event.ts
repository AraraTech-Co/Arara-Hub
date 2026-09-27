import prisma from "../../prisma";
import Model from "../Model";
import { IEvent } from "./IEvent";

export class Event extends Model<IEvent> {
  constructor() {
    super(prisma.event as never);
  }

  public custom = {
    create: async ({
      data,
      user,
      account,
    }: {
      data: Record<string, unknown>;
      user: string;
      account: string;
    }) => {
      const eventData = {
        name: data.name as string,
        metadata: data.metadata || null,
        userId: user,
        accountId: account,
        time: new Date(),
      };

      return await this.create.new(eventData as Partial<IEvent>);
    },
  };
}
