import * as feedback from "../model/schema/Feedback/Feedback";
import { Request, Response } from "express";

export const get = async (req: Request, res: Response): Promise<void> => {
  const data = await feedback.get();
  res.status(200).send({ data: data });
};

export const metrics = async (req: Request, res: Response): Promise<void> => {
  const data = await feedback.metrics();
  res.status(200).send({ data: data });
};

export const deleteFeedback = async (req: Request, res: Response): Promise<void> => {
  await feedback.deleteFeedback(req.params.id);
  res.status(200).send({ message: "Feedback item deleted" });
};