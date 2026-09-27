import prisma from "../../prisma";

interface Filter {
  search?: string;
  group?: string;
  limit?: number;
  offset?: number;
  name?: string;
}

export const get = async ({
  id,
  filter,
}: {
  id?: string;
  filter: Filter;
}) => {
  if (id) {
    const event = await prisma.event.findFirst({ where: { id } });
    if (!event) return [];

    const user = await prisma.user.findFirst({
      where: { id: event.userId || "" },
      select: { email: true },
    });

    return [
      {
        id: event.id,
        name: event.name,
        time: event.time,
        email: user?.email,
      },
    ];
  }

  if (filter.group) {
    const events = await prisma.event.findMany({
      where: filter.search
        ? { name: { contains: filter.search, mode: "insensitive" } }
        : {},
    });

    const grouped: Record<string, number> = {};
    events.forEach((e) => {
      const key =
        filter.group === "name"
          ? e.name
          : String((e as Record<string, unknown>)[filter.group as string] || "");
      grouped[key] = (grouped[key] || 0) + 1;
    });

    return Object.entries(grouped).map(([name, total_triggers]) => ({
      name,
      total_triggers,
    }));
  }

  const where: Record<string, unknown> = {};
  if (filter.name) where.name = filter.name;

  const [data, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip: filter.offset || 0,
      take: filter.limit || 10,
      orderBy: { time: "desc" },
      include: { user: { select: { email: true } } },
    }),
    prisma.event.count({ where }),
  ]);

  let results = data.map((e) => ({
    id: e.id,
    name: e.name,
    time: e.time,
    user_email: e.user?.email || null,
  }));

  if (filter.search) {
    const search = filter.search.toLowerCase();
    results = results.filter((e) =>
      e.user_email?.toLowerCase().includes(search),
    );
  }

  return { results, total };
};

export const times = async (name: string) => {
  const data = await prisma.$queryRaw<Array<{ time: string; total: bigint }>>`
    SELECT TO_CHAR(time, 'YYYY-MM-DD') as time, COUNT(*)::bigint as total
    FROM event
    WHERE name = ${name}
    GROUP BY TO_CHAR(time, 'YYYY-MM-DD')
    ORDER BY time ASC
  `;

  return data.map((e) => ({
    time: e.time,
    total: Number(e.total),
  }));
};

export const deleteEvent = async ({
  id,
  name,
}: {
  id?: string;
  name?: string;
}) => {
  if (!id && !name) throw new Error("Please provide an event ID or name");

  await prisma.event.deleteMany({
    where: {
      ...(id && { id }),
      ...(name && { name }),
    },
  });

  return id;
};
