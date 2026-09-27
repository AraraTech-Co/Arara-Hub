import express from "express";
import * as auth from "../model/lib/Auth/Auth";
import salesController from "@/controller/Sales/SalesController";
import { use } from "../helper/utility";
import track from "../helper/track";
import { validate } from "@/middlewares/zod";
import { z } from "zod";

const api = express.Router();

const planFeatureSchema = z.object({
  name: z.string().min(1),
  checked: z.boolean(),
});

api.get(
  "/api/sales/accounts",
  auth.verify("sales"),
  track,
  use(salesController.listAccounts),
);

api.get(
  "/api/sales/plans",
  auth.verify("sales"),
  track,
  use(salesController.listPlans),
);

api.post(
  "/api/sales/plans",
  auth.verify("sales"),
  validate(
    "body",
    z.object({
      id: z.string().min(1).max(64),
      name: z.string().min(1).max(256),
      price: z.number().positive(),
      interval: z.enum(["month", "year"]),
      currency: z.string().min(3).max(8).optional(),
      features: z.union([z.array(planFeatureSchema), z.string()]).optional(),
    }),
  ),
  track,
  use(salesController.createPlan),
);

api.patch(
  "/api/sales/plans/:id",
  auth.verify("sales"),
  validate(
    "params",
    z.object({
      id: z.string().min(1).max(64),
    }),
  ),
  validate(
    "body",
    z.object({
      name: z.string().min(1).max(256).optional(),
      price: z.number().positive().optional(),
      interval: z.enum(["month", "year"]).optional(),
      currency: z.string().min(3).max(8).optional(),
      features: z.union([z.array(planFeatureSchema), z.string()]).optional(),
    }),
  ),
  track,
  use(salesController.updatePlan),
);

api.patch(
  "/api/sales/plans/:id/deactivate",
  auth.verify("sales"),
  validate(
    "params",
    z.object({
      id: z.string().min(1).max(64),
    }),
  ),
  track,
  use(salesController.deactivatePlan),
);

api.patch(
  "/api/sales/accounts/:accountId/plan",
  auth.verify("sales"),
  validate(
    "params",
    z.object({
      accountId: z.string().uuid(),
    }),
  ),
  validate(
    "body",
    z.object({
      plan: z.string().min(1).max(64).optional(),
      active: z.union([z.boolean(), z.number(), z.string()]).optional(),
    }),
  ),
  track,
  use(salesController.assignAccountPlan),
);

export default api;
