import { Response } from "express";
import * as mail from "@/helper/mail";
import * as s3 from "@/helper/s3";
import { AuthRequest } from "types/express";
import Controller from "../Controller";

class UtilityController extends Controller {
  public upload = async (req: any, res: Response) => {
    try {
      // files stored in req.files
      // automatically saved to /uploads folder
      // all other fields stored in req.body
      // upload the file to s3 bucket
      if (req.files.length) {
        for (const file of req.files) {
          await s3.upload({ bucket: "YOUR_BUCKET", file: file });
        }
      }
      return this.sendSuccess(res, { message: "Upload complete" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  /*
   *  public mail endpoint
   *  can only email you to prevent spam
   */
  public utilityMail = async (req: AuthRequest, res: Response) => {
    try {
      await mail.send({
        to: process.env.SUPPORT_EMAIL,
        template: req.body.template || "contact",
        content: {
          name: req.body.name,
          email: req.body.email,
          message: req.body.message,
        },
      });
      return this.sendSuccess(res, { message: "Message sent" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new UtilityController();
