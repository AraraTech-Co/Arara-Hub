import express from "express";
import * as auth from "../model/lib/Auth/Auth";
import ticketController from "@/controller/Ticket/TicketController";
import { use } from "../helper/utility";
import track from "../helper/track";

const api = express.Router();

api.get(
  "/api/tickets",
  auth.verify("agent"),
  track,
  use(ticketController.list),
);

api.get(
  "/api/tickets/:id",
  auth.verify("agent"),
  track,
  use(ticketController.getById),
);

api.get(
  "/api/tickets/:id/messages",
  auth.verify("agent"),
  track,
  use(ticketController.getMessages),
);

api.get(
  "/api/tickets/:id/attachments",
  auth.verify("agent"),
  track,
  use(ticketController.getAttachments),
);

export default api;
