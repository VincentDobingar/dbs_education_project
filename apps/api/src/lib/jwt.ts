import jwt from "jsonwebtoken";

import { env } from "../env.js";

export interface AccessTokenPayload {
  sub: string; // User.id
}

const ACCESS_TOKEN_TTL = "15m";

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new Error("Invalid access token payload");
  }

  return { sub: decoded.sub };
}
