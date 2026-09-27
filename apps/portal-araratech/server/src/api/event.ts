import express from "express";
import * as auth from "../model/lib/Auth/Auth";
import eventController from "@/controller/Event/EventController";
import track from "../helper/track";

const api = express.Router();
import { use } from "../helper/utility";

api.post(
  "/api/event",
  auth.verify("public"),
  track,
  use(eventController.create),
);

const event = api;

export default event;
