import prisma from "../../prisma";

export const create = async ({
  user,
  token,
}: {
  user: string;
  token: string;
}) => {
  return await prisma.pushToken.create({
    data: { userId: user, token },
  });
};

export const get = async ({ user }: { user: string; token?: string }) => {
  const data = await prisma.pushToken.findMany({
    where: { userId: user },
    select: { token: true },
  });

  return data.length ? data.map((d) => d.token) : null;
};

export const deletePushToken = async ({ user }: { user: string }) => {
  return await prisma.pushToken.deleteMany({ where: { userId: user } });
};
