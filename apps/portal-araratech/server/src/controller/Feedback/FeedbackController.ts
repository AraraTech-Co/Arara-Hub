import * as mail from "@/helper/mail";
import * as utility from "@/helper/utility";
import Database from "@/model/Database";
import { Request, Response } from "express";
import Controller from "../Controller";
import { IFeedbackController } from "./IFeedbackController";
import { AuthRequest } from "@/types/express";

class FeedbackController extends Controller implements IFeedbackController {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      utility.validate(req.body, ["rating", "comment"]);
      const data = await Database.Feedback.custom.create.create({
        data: req.body,
        user: req.user,
      });

      await mail.send({
        to: process.env.SUPPORT_EMAIL,
        template: "feedback",
        content: {
          rating: req.body.rating,
          comment: req.body.comment,
        },
      });

      return this.sendSuccess(res, { data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public get = async (req: Request, res: Response) => {
    try {
      const data = await Database.Feedback.custom.read.get();
      return this.sendSuccess(res, { data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public metrics = async (req: Request, res: Response) => {
    try {
      const data = await Database.Feedback.custom.read.metrics();
      return this.sendSuccess(res, { data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public deleteFeedback = async (req: Request, res: Response) => {
    try {
      await Database.Feedback.custom.delete.deleteFeedback(req.params.id);
      return this.sendSuccess(res, { message: "Feedback item deleted" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new FeedbackController();
