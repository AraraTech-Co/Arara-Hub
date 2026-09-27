import { Request, Response } from "express";

export interface IFeedbackController {
  create(req: Request, res: Response): Promise<any>;
  get(req: Request, res: Response): Promise<any>;
  metrics(req: Request, res: Response): Promise<any>;
  deleteFeedback(req: Request, res: Response): Promise<any>;
}
