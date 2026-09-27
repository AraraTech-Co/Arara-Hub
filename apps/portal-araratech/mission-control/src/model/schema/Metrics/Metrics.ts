import * as utility from "../../../helper/utility";
import * as chart from "../../../helper/chart";
import prisma from "../../prisma";

export const accounts = async function (
  filter?: Record<string, unknown>,
): Promise<number> {
  return prisma.account.count({ where: filter });
};

export const growth = async function (): Promise<unknown> {
  const chartData: { label: string; value: number }[] = [];

  const data = await prisma.$queryRaw<Array<{ month: number; total: bigint }>>`
    SELECT EXTRACT(MONTH FROM date_created)::int as month, COUNT(*)::bigint as total
    FROM account
    GROUP BY EXTRACT(MONTH FROM date_created)
    ORDER BY month ASC
  `;

  if (data?.length) {
    data.forEach((month) => {
      chartData.push({
        label: utility.convertToMonthName(month.month),
        value: Number(month.total),
      });
    });
  }

  return chart.create(chartData, "Signups");
};
