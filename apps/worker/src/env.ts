import { baseEnvSchema, loadEnv } from "@edumanage/config";
import type { z } from "zod";

const workerEnvSchema = baseEnvSchema;

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const env: WorkerEnv = loadEnv(workerEnvSchema);
