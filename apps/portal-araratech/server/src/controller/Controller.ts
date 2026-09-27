import { Response } from "express";

export default abstract class Controller {
  protected sendSuccess(res: Response, data: any, status = 200) {
    return res.status(status).json({ success: true, data });
  }

  protected sendError(res: Response, error: any, status = 400) {
    const message =
      typeof error === "string" ? error : error?.message || "An error occurred";
    return res.status(status).json({ success: false, error: message, message });
  }
}
