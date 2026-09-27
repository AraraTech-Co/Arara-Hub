import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "types/express";

export interface IAuthController {
  signin(req: Request, res: Response): Promise<any>;
  signinOtp(req: Request, res: Response): Promise<any>;
  signup(req: Request, res: Response): Promise<any>;
  social(req: AuthRequest, res: Response, next: NextFunction): Promise<any>;
  magic(req: Request, res: Response): Promise<any>;
  verifyMagic(req: Request, res: Response): Promise<any>;
  get(req: AuthRequest, res: Response): Promise<any>;
  impersonate(req: Request, res: Response): Promise<any>;
  authSwitch(req: AuthRequest, res: Response): Promise<any>;
  signout(req: AuthRequest, res: Response): Promise<any>;
}
