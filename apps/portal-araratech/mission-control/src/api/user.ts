import express, { Request, Response, NextFunction } from "express";
import * as auth from "../model/schema/Auth/Auth";
import * as userController from "../controller/userController";
import { use } from "../helper/utility";

const api = express.Router();

api.get("/api/user", auth.verify("master"), use(userController.get));

api.post(
  "/api/user/impersonate/:id",
  auth.verify("master"),
  use(userController.impersonate)
);

api.patch("/api/user/:id", auth.verify("master"), use(userController.update));

api.delete(
  "/api/user/:id",
  auth.verify("master"),
  use(userController.deleteUser)
);

const user = api;
export default user;