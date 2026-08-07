import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Missing bearer token" });
      return;
    }

    const token = header.slice("Bearer ".length);
    let payload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Invalid or expired access token" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || user.status !== "ACTIVE" || user.deletedAt) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Account is not active" });
      return;
    }

    req.user = { id: user.id, email: user.email, status: user.status };
    next();
  })().catch(next);
}
