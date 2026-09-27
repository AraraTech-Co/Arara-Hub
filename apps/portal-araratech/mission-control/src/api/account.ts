import express, { Router } from "express";
import * as auth from "../model/schema/Auth/Auth";
import * as accountController from "../controller/accountController";
import { use } from "../helper/utility";

const api: Router = express.Router();

api.get("/api/account", auth.verify("master"), use(accountController.get));

export default api;