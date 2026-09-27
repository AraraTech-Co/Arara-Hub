import Database from "@/model/Database";
import { AuthRequest } from "types/express";
import { Response } from "express";
import Controller from "../Controller";

class PreviewController extends Controller {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      const data = await Database.Preview.create.new({
        ...req.body,
        account_id: req.account,
      });
      return this.sendSuccess(res, { message: "preview created", data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public get = async (req: AuthRequest, res: Response) => {
    try {
      const data = await Database.Preview.read.all({
        id: req.params.id,
        account_id: req.account,
      });
      return this.sendSuccess(res, { data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public update = async (req: AuthRequest, res: Response) => {
    try {
      await Database.Preview.update.one(
        {
          id: req.params.id,
          account_id: req.account,
        },
        req.body,
      );
      return this.sendSuccess(res, {
        message: "preview updated",
        data: req.body,
      });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public deletePreview = async (req: AuthRequest, res: Response) => {
    try {
      await Database.Preview.delete.one({
        id: req.params.id,
        account_id: req.account,
      });
      return this.sendSuccess(res, { message: "preview deleted" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new PreviewController();
