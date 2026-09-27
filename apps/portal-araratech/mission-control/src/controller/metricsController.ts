import * as metrics from "../model/schema/Metrics/Metrics";
import { Request, Response } from "express";

export const growth = async (req: Request, res: Response): Promise<Response> => {
  const chart = await metrics.growth();
  return res.status(200).send({ data: chart });
};

export const accounts = async (req: Request, res: Response): Promise<Response> => {
  const totalAccounts = await metrics.accounts();
  const activeAccounts = await metrics.accounts({ active: true });
  const churnedAccounts = await metrics.accounts({ active: false });

  return res.status(200).send({
    data: {
      totalAccounts: totalAccounts,
      activeAccounts: activeAccounts,
      churnedAccounts: churnedAccounts,
    },
  });
};