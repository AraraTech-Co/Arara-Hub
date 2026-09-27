import express from "express";
import * as auth from "../model/lib/Auth/Auth";
import previewController from "@/controller/Preview/previewController";
const api = express.Router();

/*
 * caller function for global error handling
 * route all calls through this to try and handle errors
 */

const use = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

api.post("/api/preview", auth.verify("user"), use(previewController.create));

api.patch(
  "/api/preview/:id",
  auth.verify("user"),
  use(previewController.update),
);

api.get("/api/preview", auth.verify("user"), use(previewController.get));

api.get("/api/preview/:id", auth.verify("user"), use(previewController.get));

api.delete(
  "/api/preview/:id",
  auth.verify("admin"),
  use(previewController.deletePreview),
);

const preview = api;
export default preview;
