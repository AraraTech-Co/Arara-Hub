import express, { Router, RequestHandler } from "express";
import * as auth from "../model/schema/Auth/Auth";
import * as metricsController from "../controller/metricsController";
import { use } from "../helper/utility";

const api: Router = express.Router();

api.get(
  "/api/metrics/accounts",
  auth.verify("master") as RequestHandler,
  use(metricsController.accounts) as RequestHandler,
);

api.get(
  "/api/metrics/accounts/growth",
  auth.verify("master") as RequestHandler,
  use(metricsController.growth) as RequestHandler,
);

const metrics = api;
export default metrics;