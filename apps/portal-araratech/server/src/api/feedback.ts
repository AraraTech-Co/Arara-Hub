import express from "express";
import * as auth from "../model/lib/Auth/Auth";
import feedbackController from "@/controller/Feedback/FeedbackController";
const api = express.Router();
import { use } from "../helper/utility";
import track from "../helper/track";
import { z } from "zod";
import { validate } from "@/middlewares/zod";

api.post(
  "/api/feedback",
  validate(
    "body",
    z.object({
      rating: z.string(),
      comment: z.string(),
    }),
  ),
  auth.verify("user"),
  track,
  use(feedbackController.create),
);

const feedback = api;
export default feedback;
