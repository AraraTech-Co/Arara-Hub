import { Request, Response } from 'express';
import * as account from '../model/schema/Account/Account';

export const get = async (req: Request, res: Response): Promise<Response> => {
  const data = await account.get();
  return res.status(200).send({ data });
};