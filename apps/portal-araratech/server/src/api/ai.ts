import express from "express";
import config from "config";
import track from "../helper/track";
import * as auth from "../model/lib/Auth/Auth";
import limiter from "express-rate-limit";
import aiController from "@/controller/Ai/AiController";
import { ThrottleConfig } from "types/config";
import { use } from "../helper/utility";

const throttle: ThrottleConfig = config.get("throttle");
const api = express.Router();
/* ai */
api.post(
  "/api/ai/text",
  limiter(throttle.api),
  auth.verify("user"),
  track,
  use(aiController.text),
);

api.post(
  "/api/ai/image",
  limiter(throttle.api),
  auth.verify("user"),
  track,
  use(aiController.image),
);

const ai = api;

export default ai;
