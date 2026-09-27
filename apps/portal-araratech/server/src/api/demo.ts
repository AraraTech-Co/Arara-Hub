/* demo purposes only - delete me */
import express from "express";
import demoController from "@/controller/Demo/DemoController";

const api = express.Router();
import { use } from "../helper/utility";

api.get("/api/demo/stats", use(demoController.stats));

api.get("/api/demo/revenue", use(demoController.revenue));

api.get("/api/demo/progress", use(demoController.progress));

api.get("/api/demo/users/list", use(demoController.users));

api.get("/api/demo/users/types", use(demoController.userTypes));

api.get("/api/demo/progress", use(demoController.progress));

const demo = api;
export default demo;
