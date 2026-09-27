import cluster from "cluster";
import Redis from "./helper/Redis";
import Database from "./model/Database";
import { sample } from "./jobs/sample/sample";

export const startCluster = async (app, port) => {
  try {
    const redisClient = new Redis(
      process.env.REDIS_QUEUE,
      process.env.REDIS_HOST,
      process.env.REDIS_PASS,
    );

    await redisClient.connect();

    app.use((req, res, next) => {
      req.redis = redisClient;
      next();
    });

    const startWorker = () => {
      console.log("REDIS IS LISTENING...");
      redisClient.waitString("sampleRead1", "queue1").then((res) => {
        console.log(`Received from Redis`);

        const worker = cluster.fork();

        worker.on("exit", (code, signal) => {
          console.log(
            `⚠️ Worker ${worker.process.pid} exited with code: ${code}, signal: ${signal}.`,
          );
          // NOTE: Start a new worker after the previous one has completed
          startWorker();
        });

        worker.send({
          job: "log-sample",
          msg: "Process this data",
          data: res?.element,
        });
      });

      redisClient.waitString("sampleRead2", "queue2").then((res) => {
        console.log(`Received from Redis`);

        const worker = cluster.fork();

        worker.on("exit", (code, signal) => {
          console.log(
            `⚠️ Worker ${worker.process.pid} exited with code: ${code}, signal: ${signal}.`,
          );
          // NOTE: Start a new worker after the previous one has completed
          startWorker();
        });

        worker.send({
          job: "log-sample-2",
          msg: "Process this data",
          data: res?.element,
        });
      });
    };

    // NOTE: Start the first worker
    startWorker();

    // NOTE: Monitor child processes
    cluster.on("online", (worker) => {
      console.log(`✅ Worker ${worker.process.pid} is online.`);
    });
  } catch (e) {
    console.log(
      "🚫 Failed Connecting to Redis, middleware won’t be available! 🚫",
    );
    console.log(
      "The application will still work, but some endpoints will be disabled.",
    );
  }
};

export const startWorkerProcess = async () => {
  console.log(`Starting ${process.pid}`);

  process.on(
    "message",
    async (msg: { data: string; job: "batch-contacts" | "batch-devices" }) => {
      const { job } = msg;
      switch (job) {
        case "batch-contacts":
          try {
            await Database.connect();
            const { data } = msg;
            const payload = JSON.parse(data);
            sample("Sample 1");
          } catch (e) {
            console.error(e);
            process.exit(1);
          }
          break;

        case "batch-devices":
          try {
            await Database.connect();
            const { data } = msg;
            const payload = JSON.parse(data);
            sample("Sample 2");
          } catch (e) {
            console.error(e);
            process.exit(1);
          }
          break;
      }
      process.exit(0);
    },
  );
};
