import jwt from "jsonwebtoken";
import config from "config";
import { Request, Response, NextFunction } from "express";
import * as utility from "../../../helper/utility";

import { TokenOptions } from './IAuth'

const permissions: Record<string, any> = config.get("permissions");

export const token = function ({ data, secret, duration }: TokenOptions): string {
  return jwt.sign(data, secret || process.env.TOKEN_SECRET!, {
    expiresIn: duration || "60",
  });
};

export const verify = function (permission: string) {
  return async function (req: Request, res: Response, next: NextFunction) {
    try {
      utility.assert(
        req.headers["authorization"],
        "No authorization header provided",
      );
      const decode = jwt.verify(
        req.headers["authorization"]!.split(" ")[1],
        process.env.TOKEN_SECRET!,
      ) as any;

      if (
        decode.accountId &&
        decode.userId &&
        decode.permission &&
        decode.provider
      ) {
        if (
          permission === "public" ||
          permissions[decode.permission][permission]
        ) {
          req.account = decode.accountId;
          req.user = decode.userId;
          req.permission = decode.permission;
          req.provider = decode.provider;
          next();
        } else throw new Error(); // user doesn't have permission
      } else throw { message: "Invalid token" }; // invalid auth token
    } catch (err: any) {
      res.status(401).send({
        message:
          err.message || "You do not have permission to perform this action.",
      });
    }
  };
};