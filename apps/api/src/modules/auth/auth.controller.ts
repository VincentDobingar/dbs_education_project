import type { NextFunction, Request, Response } from "express";

import * as authService from "./auth.service.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.validation.js";

export function register(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = registerSchema.parse(req.body);
    const user = await authService.registerUser(input);
    res.status(201).json({ id: user.id, email: user.email });
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
