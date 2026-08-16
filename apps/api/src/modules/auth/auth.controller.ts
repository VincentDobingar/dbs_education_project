import type { NextFunction, Request, Response } from "express";

import * as authService from "./auth.service.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  verifyPhoneSchema,
} from "./auth.validation.js";

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

export function resendEmailVerification(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = resendVerificationSchema.parse(req.body);
    const emailVerificationToken = await authService.resendEmailVerification(input.email);
    res.status(200).json({ emailVerificationToken });
  })().catch(next);
}

export function resendPhoneVerification(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = resendVerificationSchema.parse(req.body);
    const phoneVerificationCode = await authService.resendPhoneVerification(input.email);
    res.status(200).json({ phoneVerificationCode });
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
