import { Request } from "express";

export interface AuthRequest extends Request {
  account: string;
  permission: string;
  provider: string;
  user: string | null;
  session?: {
    deep_signin_url?: string | null;
    deep_social_url?: string | null;
    invite?: string | null;
    signup?: string | null;
  };
}
