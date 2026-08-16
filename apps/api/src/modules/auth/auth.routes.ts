import { Router } from "express";

import * as authController from "./auth.controller.js";

export const authRouter: Router = Router();

authRouter.post("/register", authController.register);
authRouter.post("/login", authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.post("/verify-email", authController.verifyEmail);
authRouter.post("/verify-phone", authController.verifyPhone);
authRouter.post("/resend-email-verification", authController.resendEmailVerification);
authRouter.post("/resend-phone-verification", authController.resendPhoneVerification);
