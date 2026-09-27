import express from "express";
import * as auth from "../model/lib/Auth/Auth";
import inviteController from "@/controller/Invite/inviteController";
const api = express.Router();
import { use } from "@/helper/utility";
import track from "@/helper/track";
import { validate } from "@/middlewares/zod";
import { z } from "zod";

/* invites */
api.post(
  "/api/invite",
  validate(
    "body",
    z.object({
      permission: z.string(),
      email: z.string().email("Invalid Email Address"),
    }),
  ),
  auth.verify("admin", "invite.create"),
  track,
  use(inviteController.create),
);

api.get(
  "/api/invite",
  auth.verify("admin", "invite.read"),
  track,
  use(inviteController.get),
);

api.get(
  "/api/invite/:id",
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  auth.verify("admin", "invite.read"),
  track,
  use(inviteController.get),
);

api.delete(
  "/api/invite/:id",
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  auth.verify("admin", "invite.delete"),
  track,
  use(inviteController.deleteInvite),
);

const invite = api;
export default invite;
