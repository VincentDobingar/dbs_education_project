import { Queue, Worker, type Job } from "bullmq";

import { getRedisConnectionOptions } from "../lib/connection.js";

export const SYSTEM_QUEUE_NAME = "system";

export interface PingJobData {
  requestedAt: string;
}

export const systemQueue = new Queue<PingJobData>(SYSTEM_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

export function createSystemWorker(): Worker<PingJobData> {
  return new Worker<PingJobData>(
    SYSTEM_QUEUE_NAME,
    (job: Job<PingJobData>) => Promise.resolve({ pong: true, receivedAt: job.data.requestedAt }),
    { connection: getRedisConnectionOptions() },
  );
}
