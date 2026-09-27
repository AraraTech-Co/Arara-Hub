import config from "config";
const domain = config.get("domain");
import * as mail from "@/helper/mail";
import * as utility from "@/helper/utility";
import { AuthRequest } from "@/types/express";
import { Response } from "express";
import Database from "@/model/Database";
import Controller from "../Controller";

class InviteController extends Controller {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      let data = req.body;
      const invites = [];
      utility.validate(data, ["email"]);

      const accountData = await Database.Account.custom.read.get(req.account);
      utility.assert(accountData, "Account does not exist");

      if (data.permission === "owner")
        throw { message: "Permission can be only owner or admin" };

      // split emails
      const emails = data.email.replace(" ", "").split(",");
      const permission = data.permission;

      // check length
      if (emails.length > 10)
        return res
          .status(500)
          .send({ inputError: "email", message: "Max 10 emails per invite" });

      // invite each user
      for (const email of emails) {
        // has user been invited?
        data = await Database.Invite.custom.read.get({
          email: email,
          account: req.account,
        });

        if (data)
          await Database.Invite.custom.update.update({
            id: data.id,
            data: { date_sent: new Date() },
          });
        else
          data = await Database.Invite.custom.create.create({
            email: email,
            permission: permission,
            account: req.account,
          });

        invites.push(data);

        await mail.send({
          to: email,
          template: "invite",
          content: {
            friend: accountData.owner_name,
            id: data.id,
            email: data.email,
            domain:
              utility.validateNativeURL(req.body.url) ||
              `${domain}/signup/user`,
          },
        });
      }

      const msg = emails.length > 1 ? "Invites sent" : "Invite sent";
      return this.sendSuccess(res, { message: msg, data: invites });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public get = async (req: AuthRequest, res: Response) => {
    try {
      const data = await Database.Invite.custom.read.get({
        id: req.params.id,
        account: req.account,
        returnArray: true,
      });
      return this.sendSuccess(res, { data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public deleteInvite = async (req: AuthRequest, res: Response) => {
    try {
      utility.assert(req.params.id, "Please provide an invite ID");
      await Database.Invite.custom.delete.deleteInvite({
        id: req.params.id,
        account: req.account,
      });
      return this.sendSuccess(res, {
        message: "Invite deleted",
        data: req.params.id,
      });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new InviteController();
