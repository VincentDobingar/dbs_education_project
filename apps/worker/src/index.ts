import { pino } from "pino";

import { env } from "./env.js";
import { createSystemWorker } from "./queues/system.queue.js";

const transport = env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined;

const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  ...(transport ? { transport } : {}),
});

const systemWorker = createSystemWorker();

systemWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job completed");
});

systemWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Job failed");
});

logger.info("Worker process started");

process.on("SIGTERM", () => {
  void systemWorker.close().then(() => process.exit(0));
});
