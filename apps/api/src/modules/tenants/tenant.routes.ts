import { Router } from "express";

import { imageUpload } from "../../lib/upload-middleware.js";
import { logoUploadRateLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";

import * as tenantController from "./tenant.controller.js";

export const tenantRouter: Router = Router();

// Deliberately NOT behind enforceTenantScope: there is no tenant to resolve yet —
// this is the endpoint that creates one (§14).
tenantRouter.post("/onboarding", requireAuth, tenantController.onboardTenant);

// Même raison : le logo est choisi à l'étape "établissement" de l'assistant
// d'inscription, avant que le tenant n'existe — l'appelant est authentifié
// (le compte est déjà créé à ce stade du parcours) mais pas encore rattaché à
// un établissement. Renvoie seulement l'URL hébergée ; onboardTenant() (juste
// après, côté client) la fournit en `logoUrl` pour la persister sur le Tenant
// créé à cet instant. `logoUploadRateLimiter` (keyé par utilisateur) après
// `requireAuth` : sans `enforceTenantScope` pour borner cet endpoint à un
// tenant, un compte créé en libre-service pourrait sinon y boucler indéfiniment.
tenantRouter.post(
  "/logo-upload",
  requireAuth,
  logoUploadRateLimiter,
  imageUpload.single("logo"),
  tenantController.uploadLogo,
);
