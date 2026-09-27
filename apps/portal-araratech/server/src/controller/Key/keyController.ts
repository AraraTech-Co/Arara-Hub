import config from "config";
import crypto from "crypto";
import * as utility from "@/helper/utility";
import { Response } from "express";
import { AuthRequest } from "types/express";
import Database from "@/model/Database";
import Controller from "../Controller";

class KeyController extends Controller {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      let data: any = req.body;
      utility.validate(data, ["name", "scope"]);

      // generate a unique key
      do data.key = "key-" + crypto.randomBytes(32).toString("hex");
      while (!(await Database.Key.custom.read.unique(data.key)));

      // save the key
      data = await Database.Key.custom.create.create({
        data: data,
        account: req.account,
      });
      return this.sendSuccess(res, { message: "API key created", data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public get = async (req: AuthRequest, res: Response) => {
    try {
      const data = await Database.Key.custom.read.get({
        id: req.params.id,
        account: req.account,
      });
      return this.sendSuccess(res, { data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public scopes = async (_: Response, res: Response) => {
    try {
      return this.sendSuccess(res, { data: config.get("api_scopes") });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public update = async (req: AuthRequest, res: Response) => {
    try {
      utility.validate(req.body);
      await Database.Key.custom.update.update({
        id: req.params.id,
        data: req.body,
        account: req.account,
      });
      return this.sendSuccess(res, { message: "API key updated" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public deleteKey = async (req: AuthRequest, res: Response) => {
    try {
      await Database.Key.custom.delete.deleteKey({
        id: req.params.id,
        account: req.account,
      });
      return this.sendSuccess(res, { message: "API key deleted" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new KeyController();
