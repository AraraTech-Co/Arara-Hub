import { AuthRequest } from "@/types/express";
import { Response } from "express";

export interface IUserController {
  create(req: AuthRequest, res: Response): Promise<any>;
  get(req: AuthRequest, res: Response): Promise<any>;
  update(req: AuthRequest, res: Response): Promise<any>;
  password(req: AuthRequest, res: Response): Promise<any>;
  resetPassword(req: AuthRequest, res: Response): Promise<any>;
  passwordResetRequest(req: AuthRequest, res: Response): Promise<any>;
  twoFa(req: AuthRequest, res: Response): Promise<any>;
  verifyTwoFa(req: AuthRequest, res: Response): Promise<any>;
  deleteUser(req: AuthRequest, res: Response): Promise<any>;
  userPermissions(req: AuthRequest, res: Response): Promise<any>;
  userAccount(req: AuthRequest, res: Response): Promise<any>;
}
