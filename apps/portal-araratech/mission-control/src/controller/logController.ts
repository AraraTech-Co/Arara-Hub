import * as log from "../model/schema/Log/Log";

import { Request, Response } from "express";

export const get = async function (req: Request, res: Response): Promise<Response> {
  const data = await log.get({ id: req.params.id, filter: req.query });
  return res.status(200).send({ data: data });
};

export const deleteLog = async function (req: Request, res: Response): Promise<Response> {
  await log.deleteLog(req.params.id);
  return res.status(200).send({ message: "Log deleted" });
};