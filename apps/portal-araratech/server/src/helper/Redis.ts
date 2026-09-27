import { createClient } from "redis";

type ClientName = "sampleRead1" | "sampleRead2";
type QueueName = "queue1" | "queue2";

export default class Redis {
  public sampleRead1: ReturnType<typeof createClient>;
  public sampleRead2: ReturnType<typeof createClient>;
  public clientWrite: ReturnType<typeof createClient>;

  private isConnected = false;
  private queueName!: string;
  private maxRetries = 5; // Maximum retries before giving up
  private retryDelay = 2000; // Delay in milliseconds between retries

  constructor(
    queueName = "default",
    host = "redis",
    pass = process.env.REDIS_PASS,
  ) {
    this.queueName = queueName;

    this.sampleRead1 = createClient({
      password: pass,
      socket: { host, port: 6379 },
    });

    this.sampleRead2 = createClient({
      password: pass,
      socket: { host, port: 6379 },
    });

    this.clientWrite = createClient({
      password: pass,
      socket: { host, port: 6379 },
    });

    this.initializeListeners();
  }

  private initializeListeners() {
    const clients = [
      { client: this.sampleRead1, name: "sampleRead1" },
      { client: this.sampleRead2, name: "sampleRead2" },
      { client: this.clientWrite, name: "clientWrite" },
    ];

    clients.forEach(({ client, name }) => {
      client.on("connect", () => console.log(`Redis ${name} connected`));
      // client.on("error", (e) =>
      //   console.error(`Failed Connecting to ${name}: ${e}`),
      // );
    });
  }

  public async connect() {
    if (this.verifyConnection()) return;

    let retries = 0;
    while (!this.isConnected && retries < this.maxRetries) {
      try {
        await Promise.all([
          this.sampleRead1.connect(),
          this.sampleRead2.connect(),
          this.clientWrite.connect(),
        ]);
        this.isConnected = true;
        console.log("All Redis connections established");
      } catch (e: any) {
        retries += 1;
        console.error(
          `Redis connection attempt ${retries} failed: ${e.message}`,
        );
        if (retries >= this.maxRetries) {
          console.error(
            "Max retry attempts reached. Could not connect to Redis.",
          );
          throw new Error(
            "Unable to connect to Redis after multiple attempts.",
          );
        }
        await this.delay(this.retryDelay);
      }
    }
  }

  public async enqueueString(str: string, queueName: QueueName) {
    const targetQueue = this.getTargetQueue(queueName);
    try {
      await this.clientWrite.lPush(targetQueue, str);
      console.log(`Enqueued string to ${targetQueue}`);
    } catch (e) {
      console.error(`Failed to enqueue string: ${e}`);
    }
  }

  public async consumeString(
    clientName: ClientName,
    queueName: QueueName,
  ): Promise<string | null> {
    const targetQueue = this.getTargetQueue(queueName);
    try {
      const result = await this[clientName].rPop(targetQueue);
      console.log(`Consumed string from ${targetQueue}: ${result}`);
      return result;
    } catch (e) {
      console.error(`Failed to consume string: ${e}`);
      throw e;
    }
  }

  public async waitString(
    clientName: ClientName,
    queueName: QueueName,
  ): Promise<{ key: string; element: string } | null> {
    const targetQueue = this.getTargetQueue(queueName);
    try {
      const result = await this[clientName].brPop(targetQueue, 0);
      console.log(`Waited and consumed string from ${targetQueue}: ${result}`);
      return result;
    } catch (e) {
      console.error(`Failed to wait for string: ${e}`);
      throw e;
    }
  }

  private getTargetQueue(queueName: QueueName): string {
    return `${this.queueName}-${queueName}`;
  }

  private verifyConnection(): boolean {
    if (this.isConnected) {
      console.log("Redis Already Connected");
      return true;
    }
    return false;
  }

  // Helper function to create a delay
  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
