import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";

import * as authController from "./auth.controller.js";
import * as mfaController from "./mfa.controller.js";

export const authRouter: Router = Router();

authRouter.post("/register", authController.register);
authRouter.post("/login", authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.post("/verify-email", authController.verifyEmail);
authRouter.post("/verify-phone", authController.verifyPhone);
authRouter.post("/resend-email-verification", authController.resendEmailVerification);
authRouter.post("/resend-phone-verification", authController.resendPhoneVerification);

// §15/§34 : appareils connectés / révocation de session — jamais par refresh token
// (l'appelant peut vouloir couper l'accès d'un appareil qu'il n'a plus en main).
authRouter.get("/sessions", requireAuth, authController.listSessions);
authRouter.post("/sessions/:id/revoke", requireAuth, authController.revokeSession);

// Identité courante + établissements — jamais enforceTenantScope/requireTenantMembership
// ici : doit répondre même pour un utilisateur sans encore aucun établissement.
authRouter.get("/me", requireAuth, authController.getCurrentUser);

authRouter.post("/mfa/verify", authController.verifyMfaChallenge);
authRouter.post("/mfa/setup", requireAuth, mfaController.setupMfa);
authRouter.post("/mfa/enable", requireAuth, mfaController.enableMfa);
authRouter.post("/mfa/disable", requireAuth, mfaController.disableMfa);
