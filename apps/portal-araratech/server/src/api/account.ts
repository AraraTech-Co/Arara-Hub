import express from "express";
import config from "config";
import * as auth from "@/model/lib/Auth/Auth";
import limiter from "express-rate-limit";
import accountController from "@/controller/Account/AccountController";
import track from "@/helper/track";
import { validate } from "@/middlewares/zod";
import { z } from "zod";
import { ThrottleConfig } from "types/config";

const throttle: ThrottleConfig = config.get("throttle");
const api = express.Router();
import { use } from "../helper/utility";

api.post(
  "/api/account",
  limiter(throttle.signup),
  validate(
    "body",
    z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid Email Address"),
      password: z
        .string()
        .min(6, "Password must be at least 6 characters long"),
    }),
  ),
  track,
  use(accountController.create),
);

api.post(
  "/api/account/plan",
  auth.verify("owner"),
  validate(
    "body",
    z.object({
      plan: z.string().min(1, "Plan is required"),
      token: z.object({
        id: z.string().min(1, "Token ID is required"),
      }),
    }),
  ),
  track,
  use(accountController.plan),
);

api.patch(
  "/api/account/plan",
  auth.verify("owner", "billing.update"),
  validate(
    "body",
    z.object({
      plan: z.string().min(1, "Plan is required"),
    }),
  ),
  track,
  use(accountController.updatePlan),
);

api.get(
  "/api/account",
  auth.verify("owner", "account.read"),
  track,
  use(accountController.get),
);

api.get(
  "/api/account/card",
  auth.verify("owner", "billing.read"),
  track,
  use(accountController.card),
);

api.patch(
  "/api/account/card",
  auth.verify("owner", "billing.update"),
  validate(
    "body",
    z.object({
      token: z.string().min(1, "Token is required"),
    }),
  ),
  track,
  use(accountController.updateCard),
);

api.get(
  "/api/account/invoice",
  auth.verify("owner", "billing.read"),
  track,
  use(accountController.invoice),
);

api.get(
  "/api/account/plans",
  auth.verify("public"),
  track,
  use(accountController.plans),
);

api.get(
  "/api/account/users",
  auth.verify("admin", "account.read"),
  track,
  use(accountController.users),
);

api.get(
  "/api/account/subscription",
  auth.verify("user", "billing.read"),
  track,
  use(accountController.subscription),
);

api.post(
  "/api/account/upgrade",
  auth.verify("owner", "billing.update"),
  validate(
    "body",
    z.object({
      plan: z.string().min(1, "Plan is required"),
      token: z.object({
        id: z.string().min(1, "Token ID is required"),
      }),
    }),
  ),
  track,
  use(accountController.upgrade),
);

api.delete(
  "/api/account",
  auth.verify("owner", "account.delete"),
  track,
  use(accountController.close),
);

api.delete(
  "/api/account/:id",
  auth.verify("owner", "account.delete"),
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  track,
  use(accountController.close),
);

const account = api;

export default account;
