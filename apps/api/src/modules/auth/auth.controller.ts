import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as authService from "./auth.service.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  verifyPhoneSchema,
} from "./auth.validation.js";
import { verifyMfaChallengeSchema } from "./mfa.validation.js";

export function register(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = registerSchema.parse(req.body);
    const result = await authService.registerUser(input);
    res.status(201).json({
      id: result.user.id,
      email: result.user.email,
      status: result.user.status,
      // §34 : pas de fournisseur email/SMS réel — voir le commentaire sur registerUser.
      emailVerificationToken: result.emailVerificationToken,
      ...(result.phoneVerificationCode ? { phoneVerificationCode: result.phoneVerificationCode } : {}),
    });
  })().catch(next);
}

export function verifyEmail(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = verifyEmailSchema.parse(req.body);
    const user = await authService.verifyEmail(input.token);
    res.status(200).json({ id: user.id, status: user.status });
  })().catch(next);
}

export function verifyPhone(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = verifyPhoneSchema.parse(req.body);
    const user = await authService.verifyPhone(input.email, input.code);
    res.status(200).json({ id: user.id, status: user.status });
  })().catch(next);
}

// §34 (audit pass 24) : toujours 200 avec un message générique — le jeton/code n'est
// inclus que lorsque authService a effectivement quelque chose à renvoyer, jamais un
// statut/champ différent selon "compte inexistant"/"déjà vérifié"/"pas de téléphone".
const GENERIC_RESEND_MESSAGE = "If this account exists and needs verification, a new code was sent.";

export function resendEmailVerification(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = resendVerificationSchema.parse(req.body);
    const emailVerificationToken = await authService.resendEmailVerification(input.email);
    res.status(200).json({
      message: GENERIC_RESEND_MESSAGE,
      ...(emailVerificationToken ? { emailVerificationToken } : {}),
    });
  })().catch(next);
}

export function resendPhoneVerification(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = resendVerificationSchema.parse(req.body);
    const phoneVerificationCode = await authService.resendPhoneVerification(input.email);
    res.status(200).json({
      message: GENERIC_RESEND_MESSAGE,
      ...(phoneVerificationCode ? { phoneVerificationCode } : {}),
    });
  })().catch(next);
}

export function login(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = loginSchema.parse(req.body);
    const tokens = await authService.login(input.email, input.password, {
      ...(req.headers["user-agent"] ? { userAgent: req.headers["user-agent"] } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(200).json(tokens);
  })().catch(next);
}

export function verifyMfaChallenge(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = verifyMfaChallengeSchema.parse(req.body);
    const tokens = await authService.verifyMfaChallenge(input.challengeToken, input.code, {
      ...(req.headers["user-agent"] ? { userAgent: req.headers["user-agent"] } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(200).json(tokens);
  })().catch(next);
}

export function refresh(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(input.refreshToken);
    res.status(200).json(tokens);
  })().catch(next);
}

export function logout(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = refreshSchema.parse(req.body);
    await authService.logout(input.refreshToken);
    res.status(204).send();
  })().catch(next);
}

export function listSessions(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const sessions = await authService.listSessions(req.user.id);
    res.status(200).json(sessions);
  })().catch(next);
}

export function revokeSession(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    await authService.revokeSession(req.user.id, req.params.id as string);
    res.status(204).send();
  })().catch(next);
}

export function getCurrentUser(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const profile = await authService.getCurrentUserProfile(req.user.id);
    res.status(200).json(profile);
  })().catch(next);
}
