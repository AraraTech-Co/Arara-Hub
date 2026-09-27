import { Response } from "express";
import * as demo from "@/model/lib/Demo/demo";

/*
 * returns sample data for the demo dashboard
 * you can delete this file
 */

class DemoController {
  public revenue(req: any, res: Response) {
    const data = demo.revenue();
    return res.status(200).send({ data });
  }

  public users(req: any, res: Response) {
    const data = demo.users();
    return res.status(200).send({ data });
  }

  public stats(req: any, res: Response) {
    const data = demo.stats();
    return res.status(200).send({ data });
  }

  public progress(req: any, res: Response) {
    const data = demo.progress();
    return res.status(200).send({ data });
  }

  public userTypes(req: any, res: Response) {
    const data = demo.usersTypes();
    return res.status(200).send({ data });
  }
}

export default new DemoController();
