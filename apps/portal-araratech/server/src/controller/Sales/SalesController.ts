import { Request, Response } from "express";
import Controller from "../Controller";
import Database from "@/model/Database";
import planService from "@/model/lib/Plan/planService";
import { PlanFeature } from "@/model/schema/Plan/IPlan";

function parseFeatures(value: unknown): PlanFeature[] {
  if (Array.isArray(value)) return value as PlanFeature[];
  if (typeof value !== "string" || !value.trim()) return [];

  return value
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((name) => ({ name, checked: true }));
}

function parseActive(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return value === true || value === 1 || value === "1";
}

class SalesController extends Controller {
  public listAccounts = async (_req: Request, res: Response) => {
    try {
      const data = await Database.Account.custom.read.listOwners();
      return this.sendSuccess(res, data);
    } catch (error) {
      return this.sendError(res, "Failed to load sales accounts", 500);
    }
  };

  public listPlans = async (_req: Request, res: Response) => {
    try {
      const data = await planService.listAll();
      return this.sendSuccess(res, data);
    } catch (error) {
      return this.sendError(res, "Failed to load plans", 500);
    }
  };

  public createPlan = async (req: Request, res: Response) => {
    try {
      const data = await planService.create({
        id: String(req.body.id).toLowerCase(),
        name: req.body.name,
        price: Number(req.body.price),
        interval: req.body.interval,
        currency: req.body.currency,
        features: parseFeatures(req.body.features),
      });
      return this.sendSuccess(res, data, 201);
    } catch (error: any) {
      return this.sendError(
        res,
        error.message || "Failed to create plan",
        error.status || 400,
      );
    }
  };

  public updatePlan = async (req: Request, res: Response) => {
    try {
      const data = await planService.update(req.params.id, {
        name: req.body.name,
        price:
          req.body.price !== undefined ? Number(req.body.price) : undefined,
        interval: req.body.interval,
        currency: req.body.currency,
        features:
          req.body.features !== undefined
            ? parseFeatures(req.body.features)
            : undefined,
      });
      return this.sendSuccess(res, data);
    } catch (error: any) {
      return this.sendError(
        res,
        error.message || "Failed to update plan",
        error.status || 400,
      );
    }
  };

  public deactivatePlan = async (req: Request, res: Response) => {
    try {
      const data = await planService.deactivate(req.params.id);
      return this.sendSuccess(res, data);
    } catch (error: any) {
      return this.sendError(
        res,
        error.message || "Failed to deactivate plan",
        error.status || 400,
      );
    }
  };

  public assignAccountPlan = async (req: Request, res: Response) => {
    try {
      const data = await planService.assignPlanToAccount(
        req.params.accountId,
        {
          plan: req.body.plan,
          active: parseActive(req.body.active),
        },
      );
      return this.sendSuccess(res, data);
    } catch (error: any) {
      const status = error.status === 402 ? 400 : error.status || 400;
      return this.sendError(
        res,
        error.message || "Failed to update account plan",
        status,
      );
    }
  };
}

export default new SalesController();
