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

authRouter.post("/mfa/verify", authController.verifyMfaChallenge);
authRouter.post("/mfa/setup", requireAuth, mfaController.setupMfa);
authRouter.post("/mfa/enable", requireAuth, mfaController.enableMfa);
authRouter.post("/mfa/disable", requireAuth, mfaController.disableMfa);
