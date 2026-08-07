import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";

import { env } from "./env.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.use("/api/v1", healthRouter);
  app.use("/api/v1/auth", authRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: "NOT_FOUND", message: "Resource not found" });
  });

  // Centralized error handler: never leak internal error details to clients.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid request", issues: err.issues });
      return;
    }

    if (err instanceof AppError) {
      res.status(err.status).json({ code: err.code, message: err.message });
      return;
    }

    req.log?.error({ err }, "Unhandled request error");
    res.status(500).json({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
  });

  return app;
}
