import type { Request, Response } from "express";
import rateLimit, { type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { env } from "../env.js";
import { getRedisClient } from "../lib/redis.js";

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

/**
 * Store Redis plutôt que le `MemoryStore` par défaut d'express-rate-limit : un
 * compteur en mémoire de process redevient un compteur PAR INSTANCE dès que l'API
 * tourne derrière un load balancer avec plusieurs instances — la limite réelle
 * devient `limit × nombre d'instances`, et rien ne garantit qu'un attaquant reste
 * sur la même instance d'une requête à l'autre. Le plus dangereux sur
 * `authRateLimiter` : censé plafonner le brute-force/credential-stuffing de
 * connexion (§34), il perdrait silencieusement son effet en production
 * multi-instance sans jamais échouer en dev/tests (une seule instance).
 *
 * Pas de store dédié en test : `skipInTest` empêche déjà toute requête de test
 * d'atteindre le store, donc ouvrir une connexion Redis par processus de test
 * n'apporterait rien (voir lib/redis.ts, création paresseuse).
 */
function buildStore(): Store | undefined {
  if (env.NODE_ENV === "test") return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) => getRedisClient().call(...args),
    prefix: "rl:",
  });
}

/** Exported for testability — a real `NODE_ENV=test` process can never observe the
 * "engaged" path of `apiRateLimiter`/`authRateLimiter` themselves (skip is always
 * true there), so the regression test builds its own instance with `skip` overridden. */
export function buildRateLimiter(options: {
  windowMs: number;
  limit: number;
  skip?: () => boolean;
  keyGenerator?: (req: Request) => string;
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip ?? skipInTest,
    handler: rateLimitedResponse,
    store: buildStore(),
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
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

/**
 * POST /tenants/logo-upload est délibérément accessible sans tenant résolu (le
 * compte existe, l'établissement pas encore, §14) — donc sans `enforceTenantScope`
 * pour le scoper. Sans autre limite qu'`apiRateLimiter` (générique, par IP), un
 * compte créé en libre-service pouvait boucler sur cet endpoint indéfiniment (~3 Mo
 * par appel, `MAX_IMAGE_BYTES`) sans jamais terminer l'inscription, écrivant des
 * fichiers sur disque qu'aucun job ne purge. Keyé par utilisateur (jamais par IP :
 * `requireAuth` a déjà résolu `req.user` à ce point de la chaîne de middlewares) —
 * un utilisateur authentifié ne peut pas se cacher derrière une IP partagée pour
 * échapper à cette limite comme il le pourrait avec un simple compteur par IP.
 */
export const logoUploadRateLimiter = buildRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
});

/**
 * Passe d'audit sécurité n°27 : POST /family/invitations envoie un SMS/email réel
 * (coût fournisseur) vers un `invitedPhone`/`invitedEmail` fourni librement par le
 * client, jamais vérifié comme appartenant à un parent existant — sans cette limite,
 * seul l'apiRateLimiter générique (600 req/15 min par IP) bornait un membre du
 * personnel qui voudrait s'en servir comme relais de spam gratuit (facturé à
 * l'établissement) vers des tiers non consentants. Keyé par utilisateur comme
 * `logoUploadRateLimiter` : la route exige déjà `requireAuth`.
 */
export const familyInvitationRateLimiter = buildRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
});

/**
 * Passe d'audit sécurité n°27 : resendEmailVerification/resendPhoneVerification sont
 * appelées avant authentification (seul un `email` dans le corps), donc keyées par
 * IP via l'authRateLimiter global ne suffit pas — un attaquant qui s'inscrit avec le
 * numéro/email d'un tiers peut ensuite marteler cette route en petites salves depuis
 * des IP différentes tant que le compte reste non vérifié. Keyée par l'email ciblé
 * (normalisé), donc indépendante de l'IP appelante et de la rotation d'IP.
 */
export const resendVerificationRateLimiter = buildRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" ? email.trim().toLowerCase() : "unknown";
  },
});
