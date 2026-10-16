import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken, verifyMfaEnrollmentToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

async function loadActiveUser(userId: string, req: Request, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "Account is not active" });
    return false;
  }

  req.user = { id: user.id, email: user.email, status: user.status };
  return true;
}

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

    if (await loadActiveUser(payload.sub, req, res)) next();
  })().catch(next);
}

/**
 * MFA obligatoire pour rôles sensibles : réservé aux deux routes d'enrôlement
 * (/mfa/setup, /mfa/enable) qui doivent rester joignables soit par une session
 * normale (opt-in volontaire existant), soit par le jeton d'enrôlement à portée
 * restreinte émis par login() quand le rôle est sensible et le MFA pas encore
 * actif (auth.service.ts). `verifyAccessToken` rejette déjà tout jeton portant un
 * `typ` (donc jamais confondu avec le jeton d'enrôlement), et
 * `verifyMfaEnrollmentToken` n'accepte que son propre `typ` — aucun des deux jetons
 * ne peut se faire passer pour l'autre.
 */
export function requireAuthOrMfaEnrollment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Missing bearer token" });
      return;
    }

    const token = header.slice("Bearer ".length);
    let userId: string;

    try {
      userId = verifyAccessToken(token).sub;
    } catch {
      try {
        userId = verifyMfaEnrollmentToken(token).sub;
      } catch {
        res.status(401).json({ code: "UNAUTHENTICATED", message: "Invalid or expired token" });
        return;
      }
    }

    if (await loadActiveUser(userId, req, res)) next();
  })().catch(next);
}
