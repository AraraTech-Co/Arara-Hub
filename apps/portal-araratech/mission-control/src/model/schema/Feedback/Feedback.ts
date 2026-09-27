import prisma from "../../prisma";

export const get = async function (_id?: string) {
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
};

export const metrics = async function () {
  const data = await prisma.feedback.groupBy({
    by: ["rating"],
    _count: { rating: true },
  });

  const res: Record<string, number> = {};
  data.forEach((x) => {
    res[x.rating] = x._count.rating;
  });
  return res;
};

export const deleteFeedback = async function (id: string) {
  return await prisma.feedback.deleteMany({ where: { id } });
};
