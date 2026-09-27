import * as pushtoken from "@/model/lib/PushToken/pushtoken";
import * as utility from "@/helper/utility";
import { AuthRequest } from "types/express";
import { Response } from "express";
import Controller from "../Controller";

class PushTokenController extends Controller {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      // does this token already belong to this user?
      utility.validate(req.body, ["push_token"]);
      const token = await pushtoken.get({
        user: req.user,
        token: req.body.push_token,
      });

      if (!token?.length)
        await pushtoken.create({ user: req.user, token: req.body.push_token });

      return this.sendSuccess(res, { message: "Push token saved" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new PushTokenController();
