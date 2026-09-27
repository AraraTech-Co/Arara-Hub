import { AuthRequest } from "@/types/express";
import { Response } from "express";

export interface ISocialController {
  socialCallback(req: AuthRequest, res: Response): Promise<any>;
}

export interface ISocialControllerStatic {
  handleCallback(
    req: AuthRequest,
    profile: any,
    tokens: { access: string; refresh: string },
    done: (err: any, user?: any) => void,
  ): Promise<any>;
}
