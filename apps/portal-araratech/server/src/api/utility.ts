import express from "express";
import multer from "multer";
import track from "../helper/track";
import * as auth from "../model/lib/Auth/Auth";
import utilityController from "@/controller/Utility/utilityController";

const upload = multer({ dest: "uploads" });
const api = express.Router();
import { use } from "../helper/utility";

api.post(
  "/api/utility/upload",
  auth.verify("user"),
  upload.any(),
  track,
  use(utilityController.upload),
);

api.post("/api/utility/mail", use(utilityController.utilityMail));

const utility = api;
export default utility;
