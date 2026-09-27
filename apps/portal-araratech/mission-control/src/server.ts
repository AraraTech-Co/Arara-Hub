import * as dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import api from "./api";
import path from "path";
import config from "config";
import cors from "cors";
import * as database from "./model/database";
import limiter from "express-rate-limit";

type ThrottleConfig = {
  throttle: {
    api: {
      max: number;
      windowMs: number;
      headers: boolean;
      message: string;
    };
    signin: {
      max: number;
      windowMs: number;
      headers: boolean;
      message: string;
    };
  };
};

const throttle = config.get<ThrottleConfig["throttle"]>("throttle");

const port = process.env.PORT || 5001;
const app = express();

app.use(cors({ origin: process.env.CLIENT_URL }));
app.options("*", cors({ origin: process.env.CLIENT_URL }));

app.use(express.json());
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true }));

app.use("/api/", limiter(throttle.api));
app.use(api);

if (
  process.env.NODE_ENV === "production" ||
  process.env.NODE_ENV === "staging"
) {
  app.use(express.static(path.join(__dirname, "client/build")));

  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname + "/client/build/index.html"));
  });
}

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  let message: string | null = null;

  if (err.raw) {
    message = err.raw.message;
  } else if (err.message) {
    message = err.message;
  } else if (err.sqlMessage) {
    message = err.sqlMessage;
  }

  console.error(err);

  message
    ? res.status(500).send({ message: message })
    : res.status(500).send(err);
});

const server = app.listen(port, async () => {
  console.log("Welcome to Sample Mission Control 🕹");
  await database.connect();
});

export default server;
