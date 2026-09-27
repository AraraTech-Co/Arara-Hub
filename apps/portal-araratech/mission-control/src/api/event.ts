import express, { Request, Response, NextFunction } from "express";
import * as auth from "../model/schema/Auth/Auth";
import * as eventController from "../controller/eventController";
import { use } from "../helper/utility";

const api = express.Router();

api.get("/api/event", auth.verify("master"), use(eventController.get));

api.get("/api/event/:id", auth.verify("master"), use(eventController.get));

api.delete(
  "/api/event/:id",
  auth.verify("master"),
  use(eventController.deleteEvent)
);

const event = api;
export default event;