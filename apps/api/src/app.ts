import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";

import { env } from "./env.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { employeeRouter } from "./modules/employees/employee.routes.js";
import { gradingRouter } from "./modules/grading/grading.routes.js";
import { paymentWebhookRouter } from "./modules/payments/payment.routes.js";
import { schoolConfigRouter } from "./modules/school-config/school-config.routes.js";
import { studentRouter } from "./modules/students/student.routes.js";
import { studentTransferRouter } from "./modules/students/transfer.routes.js";
import { subscriptionRouter } from "./modules/subscriptions/subscription.routes.js";
import { tenantUserRouter } from "./modules/tenant-users/tenant-user.routes.js";
import { tenantRouter } from "./modules/tenants/tenant.routes.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(pinoHttp({ logger }));

  // Webhooks need the exact raw bytes the provider signed — mounted with their
  // own raw body parser BEFORE the global JSON parser below, and before any
  // auth middleware (the provider authenticates via its webhook signature, §24).
  app.use("/api/v1/payments/webhooks", express.raw({ type: "*/*", limit: "1mb" }), paymentWebhookRouter);

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/v1", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/tenants", tenantRouter);
  app.use("/api/v1/subscriptions", subscriptionRouter);
  app.use("/api/v1/school-config", schoolConfigRouter);
  app.use("/api/v1/grading", gradingRouter);
  app.use("/api/v1/students", studentRouter);
  app.use("/api/v1/student-transfers", studentTransferRouter);
  app.use("/api/v1/employees", employeeRouter);
  app.use("/api/v1/tenant-users", tenantUserRouter);

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
