import jwt from "jsonwebtoken";
import config from "config";
import * as utility from "../../../helper/utility";
import Database from "../../Database";
const permissions = config.get("permissions");
const settings: any = config.get("token");

/*
 * auth.token()
 * generate a JSON web token
 */

export const token = function ({
  data,
  secret = null,
  duration = null,
}: {
  data: any;
  secret?: string | null;
  duration?: string | number | null;
}) {
  return jwt.sign(data, secret || process.env.TOKEN_SECRET, {
    expiresIn: duration || settings.duration,
  });
};

/*
 * auth.token.verify()
 * verify a JWT
 */

export const verifyToken = function ({
  token,
  secret = null,
}: {
  token: string;
  secret?: string | null;
}) {
  return jwt.verify(token, secret || process.env.TOKEN_SECRET);
};

/*
 * auth.verify()
 * verify the user
 */

export const verify = function (permission: string, scope: string = null) {
  return async function (req: any, res: any, next: any) {
    try {
      const header = req.headers["authorization"];

      // check header was provided
      if (!header) {
        if (permission === "public") {
          return next();
        } else {
          throw { message: "No authorization header provided" };
        }
      }

      // process the header
      const type = header.split(" ")[0];
      const token = header.split(" ")[1];

      // request is using api key
      if (type === "Basic") {
        // use plaintext api key or decode base64
        const apikey = token.includes("key-")
          ? token
          : utility.base64.decode(token).replace(":", "");

        const verified: any = await Database.Key.custom.read.verify(apikey);
        utility.assert(verified, "Invalid API key");

        // key ok, check scope
        const verifiedScope = verified.scope as string[];
        utility.assert(
          verifiedScope.includes(scope),
          `You don't have permission to use this scope`,
        );

        // log request and continue
        if (process.env.ENABLE_API_LOGS === "true")
          Database.Log.custom.create.new({
            message: null,
            body: req.body,
            req: req,
            account: verified.account_id,
          });

        req.account = verified.account_id;
        next();
      } else if (type === "Bearer") {
        const decode = jwt.verify(token, process.env.TOKEN_SECRET);

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
      } else throw { message: "Unrecognised header type" }; // unknown header type
    } catch (err: any) {
      res.status(401).send({
        message:
          err.message || "You do not have permission to perform this action.",
      });
    }
  };
};
