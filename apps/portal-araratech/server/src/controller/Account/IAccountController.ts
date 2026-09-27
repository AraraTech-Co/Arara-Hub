import { Request, Response } from "express";
import { AuthRequest } from "types/express";

export interface IAccountController {
  create(req: Request, res: Response): Promise<any>;
  plan(req: AuthRequest, res: Response): Promise<any>;
  updatePlan(req: AuthRequest, res: Response): Promise<any>;
  get(req: AuthRequest, res: Response): Promise<any>;
  subscription(req: Request | any, res: Response): Promise<any>;
  upgrade(req: AuthRequest, res: Response): Promise<any>;
  card(req: Request | any, res: Response): Promise<any>;
  updateCard(req: AuthRequest, res: Response): Promise<any>;
  invoice(req: AuthRequest, res: Response): Promise<any>;
  users(req: AuthRequest, res: Response): Promise<any>;
  close(req: AuthRequest, res: Response): Promise<any>;
  plans(req: AuthRequest, res: Response): Promise<any>;
}
