import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../env.js";

/**
 * §34 : « limitation des requêtes » — absente jusqu'ici malgré une exigence
 * explicite du cahier des charges. Désactivée en test (`NODE_ENV=test`) : les
 * suites d'intégration font délibérément des dizaines d'appels rapprochés contre
 * la même instance d'app, un comportement de test légitime, jamais une attaque.
 */
function skipInTest(): boolean {
  return env.NODE_ENV === "test";
}

function rateLimitedResponse(_req: Request, res: Response): void {
  res.status(429).json({ code: "RATE_LIMITED", message: "Too many requests, please try again later" });
}

/** Exported for testability — a real `NODE_ENV=test` process can never observe the
 * "engaged" path of `apiRateLimiter`/`authRateLimiter` themselves (skip is always
 * true there), so the regression test builds its own instance with `skip` overridden. */
export function buildRateLimiter(options: {
  windowMs: number;
  limit: number;
  skip?: () => boolean;
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip ?? skipInTest,
    handler: rateLimitedResponse,
  });
}

/** Backstop générique sur toute l'API — généreux, pense DoS plutôt que brute force ciblé. */
export const apiRateLimiter = buildRateLimiter({ windowMs: 15 * 60 * 1000, limit: 600 });

/**
 * Plus strict sur les routes d'authentification (login, inscription, vérification
 * email/téléphone, MFA) — complète, sans le remplacer, le verrouillage par compte
 * déjà en place (§34, échecs de connexion) : celui-ci protège aussi contre le
 * bourrage de comptes différents (credential stuffing) et le brute-force de codes
 * de vérification, que le verrouillage par compte ne couvre pas.
 */
export const authRateLimiter = buildRateLimiter({ windowMs: 15 * 60 * 1000, limit: 20 });
