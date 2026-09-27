import prisma from "../../prisma";
import Model from "../Model";
import { IFeedback } from "./IFeedback";

export class Feedback extends Model<IFeedback> {
  constructor() {
    super(prisma.feedback as never);
  }

  public custom = {
    create: {
      create: async ({
        data,
        user,
      }: {
        data: { rating: string; comment?: string };
        user: string;
      }) => {
        const newFeedback = {
          rating: data.rating,
          comment: data.comment,
          dateCreated: new Date(),
          userId: user,
        };

        return await this.create.new(newFeedback as Partial<IFeedback>);
      },
    },
    read: {
      get: async (_id: string | null = null) => {
        const data = await prisma.feedback.findMany({
          include: { user: { select: { id: true, email: true } } },
        });

        return data.map((f) => ({
          id: f.id,
          user_id: f.userId,
          comment: f.comment,
          rating: f.rating,
          email: f.user.email,
        }));
      },

      metrics: async () => {
        const data = await prisma.feedback.groupBy({
          by: ["rating"],
          _count: { rating: true },
        });

        const res: Record<string, number> = {};
        data.forEach((x) => {
          res[x.rating] = x._count.rating;
        });
        return res;
      },
    },
    update: {},
    delete: {
      deleteFeedback: async (id: string) => {
        return await prisma.feedback.deleteMany({ where: { id } });
      },
    },
  };
}
