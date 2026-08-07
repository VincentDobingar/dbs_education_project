import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import { AppError } from "../lib/errors.js";

/** supertest types response.body as `any`; cast to this to read it safely in assertions. */
export interface TestResponseBody {
  code?: string;
  message?: string;
  ok?: boolean;
  tenantId?: string | null;
}

/** Minimal app for exercising a middleware chain in isolation, mirroring app.ts's error handling. */
export function buildTestApp(...middlewares: RequestHandler[]): Express {
  const app = express();
  app.use(express.json());

  app.get("/protected/:studentId?", ...middlewares, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ code: err.code, message: err.message });
      return;
    }

    res.status(500).json({ code: "INTERNAL_ERROR", message: String(err) });
  });

  return app;
}
