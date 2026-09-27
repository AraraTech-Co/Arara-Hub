// FIX: import * as chart from "../helper/chart";
import * as utility from "@/helper/utility";
import Database from "@/model/Database";
import { AuthRequest } from "types/express";
import { Response } from "express";
import Controller from "../Controller";

class EventController extends Controller {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      if (process.env.STORE_EVENT_LOGS === "true") {
        utility.validate(req.body, ["name"]);
        const data = await Database.Event.custom.create({
          data: req.body,
          user: req.user,
          account: req.account,
        });
        return this.sendSuccess(res, { message: "Event created", data: data });
      }
      return res.status(200).send();
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public get = async (req: AuthRequest, res: Response) => {
    // The original logic is commented out. Implement as needed.
    return res.status(503).send({ msg: "Endpoint is Deactivated. (@Hefler)" });
  };

  public deleteEvent = async (req: AuthRequest, res: Response) => {
    // The original logic is commented out. Implement as needed.
    return res.status(503).send({ msg: "Endpoint is Deactivated. (@Hefler)" });
  };
}

export default new EventController();
