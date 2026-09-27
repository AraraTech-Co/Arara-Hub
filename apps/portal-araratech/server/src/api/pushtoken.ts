import express from "express";
import track from "../helper/track";
import * as auth from "../model/lib/Auth/Auth";
import pushtokenController from "@/controller/PushToken/pushtokenController";
const api = express.Router();
import { use } from "../helper/utility";
import { validate } from "@/middlewares/zod";
import { z } from "zod";

api.put(
  "/api/pushtoken/",
  validate(
    "body",
    z.object({
      push_token: z.string(),
    }),
  ),
  auth.verify("user"),
  track,
  use(pushtokenController.create),
);

const pushtoken = api;
export default pushtoken;
