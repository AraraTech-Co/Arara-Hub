import prisma from "../../prisma";

interface Filter {
  search?: string;
  limit?: string;
  offset?: string;
}

export const get = async ({
  id,
  filter,
}: {
  id?: string;
  filter?: Filter;
}) => {
  if (id) {
    const data = await prisma.log.findFirst({ where: { id } });
    return data ? [data] : [];
  }

  const where = filter?.search
    ? {
        OR: [
          { message: { contains: filter.search, mode: "insensitive" as const } },
          { body: { contains: filter.search, mode: "insensitive" as const } },
          { method: { contains: filter.search, mode: "insensitive" as const } },
          { endpoint: { contains: filter.search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [results, total] = await Promise.all([
    prisma.log.findMany({
      where,
      take: parseInt(filter?.limit || "0") || undefined,
      skip: parseInt(filter?.offset || "0") || undefined,
      orderBy: { time: "desc" },
    }),
    prisma.log.count({ where }),
  ]);

  return { results, total };
};

export const deleteLog = async (id: string) => {
  return await prisma.log.deleteMany({ where: { id } });
};
