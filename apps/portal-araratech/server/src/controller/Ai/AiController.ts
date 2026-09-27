import * as openai from "@/model/lib/OpenAi/openai";
import * as utility from "@/helper/utility";
import { Request, Response } from "express";

class AiController {
  public text = async (req: Request, res: Response) => {
    const data = req.body;
    utility.validate(data, ["prompt"]);

    const chatData = await openai.text({ prompt: data.prompt });
    return res.status(200).send({ data: chatData });
  };

  public image = async (req: Request, res: Response) => {
    const data = req.body;
    utility.validate(data, ["prompt", "size"]);

    const imageData = await openai.image({
      prompt: data.prompt,
      size: data.size,
    });
    return res.status(200).send({ data: imageData });
  };
}

export default new AiController();
