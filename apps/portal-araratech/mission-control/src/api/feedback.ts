import express from "express";
import * as auth from "../model/schema/Auth/Auth";
import * as feedbackController from "../controller/feedbackController";
import { use } from "../helper/utility";

const api = express.Router();

api.get("/api/feedback", auth.verify("master"), use(feedbackController.get));

api.get("/api/feedback/metrics", auth.verify("master"), use(feedbackController.metrics));

api.delete("/api/feedback/:id", auth.verify("master"), use(feedbackController.deleteFeedback));

const feedback = api;
export default feedback;