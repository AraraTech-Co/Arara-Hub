import express from "express";
import * as auth from "@/model/lib/Auth/Auth";
import keyController from "@/controller/Key/keyController";
const api = express.Router();
import { use } from "../helper/utility";
import track from "../helper/track";
import { validate } from "@/middlewares/zod";
import { z } from "zod";

api.post(
  "/api/key",
  validate(
    "body",
    z.object({
      name: z.string().min(1, "Name is required"),
      scope: z.array(z.string()),
    }),
  ),
  auth.verify("developer", "key.create"),
  track,
  use(keyController.create),
);

api.get(
  "/api/key",
  auth.verify("developer", "key.read"),
  track,
  use(keyController.get),
);

api.get(
  "/api/key/scopes",
  auth.verify("developer", "key.read"),
  track,
  use(keyController.scopes),
);

api.get(
  "/api/key/:id",
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  auth.verify("developer", "key.read"),
  track,
  use(keyController.get),
);

api.patch(
  "/api/key/:id",
  validate(
    "body",
    z.object({
      name: z.string().min(1, "Name is required"),
      scope: z.array(z.string()),
    }),
  ),
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  auth.verify("developer", "key.update"),
  track,
  use(keyController.update),
);

api.delete(
  "/api/key/:id",
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  auth.verify("developer", "key.delete"),
  track,
  use(keyController.deleteKey),
);

const key = api;
export default key;
