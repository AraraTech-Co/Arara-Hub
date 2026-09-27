require("dotenv").config();
import moduleAlias from "module-alias";
(moduleAlias as unknown as { addAlias: (name: string, path: string) => void }).addAlias("@", __dirname);
moduleAlias();
import "./helper/environment";
import express, { Express, Request, Response, NextFunction } from "express";
import api from "./api";
import router from "./router";
import path from "path";
import Database from "./model/Database";
import cluster from "cluster";
import { startCluster, startWorkerProcess } from "./clusterManager";
import {
  bootConfig,
  bootCors,
  bootErrorHandler,
  bootHelmet,
  bootThrottle,
} from "./middlewares";

if (cluster.isPrimary) {
  (async () => {
    const port: number | string =
      process.env.NODE_ENV !== "test" ? process.env.PORT || 8080 : 9000;
    const app: Express = express();

    /*NOTE:
     * Thi map boot every middleware by passing as argument the instance of
     * the application. Every middleware registered here
     * should have a sync execution.
     * The configuration for each middleware is on it's respective files.
     */
    [bootHelmet, bootCors, bootConfig, bootThrottle].map((f) => {
      f(app);
    });

    /* NOTE:
     * This Integrates clustering on the application.
     * With clustering, any endpoint that requires
     * more process or longer response times, should
     * be transformed in a JOB.
     */
    await startCluster(app, port);

    /* NOTE:
     * Those are the routes inherited from the "api" folder
     * and static files server for production and staging environments.
     * Also the expose of the server at the port defined in the env,
     * probably 8080, is defined here
     * Hardly this portion will be tweaked in the application
     */
    app.use(api);
    app.use(router);
    if (
      process.env.NODE_ENV === "production" ||
      process.env.NODE_ENV === "staging"
    ) {
      app.use(express.static(path.join(__dirname, "client/build")));

      app.get("*", (req: Request, res: Response) => {
        res.sendFile(path.join(__dirname + "/client/build/index.html"));
      });
    }

    bootErrorHandler(app);

    const server = app.listen(port, async () => {
      const mongoOptions = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        authSource: "admin",
      };
      await Database.connect(/* mongoOptions */);
      console.log(`Server is running on port ${port}`);
    });

    process.on("SIGINT", () => {
      server.close(() => {
        console.log("Process terminated");
        process.exit(0);
      });
    });

    process.on("SIGTERM", () => {
      server.close(() => {
        console.log("Process terminated");
        process.exit(0);
      });
    });
  })();
} else {
  /* NOTE:
   * For any aditional process created, it should
   * skip server creation and fall here.
   * This serves specifically for clustering.
   */
  startWorkerProcess();
}
