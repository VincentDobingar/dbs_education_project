import { pino } from "pino";

import { env } from "../env.js";

const transport = env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined;

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret"],
  ...(transport ? { transport } : {}),
});
