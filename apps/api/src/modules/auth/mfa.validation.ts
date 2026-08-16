import { z } from "zod";

export const enableMfaSchema = z.object({
  code: z.string().min(1),
});

export const disableMfaSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(1),
});

export const verifyMfaChallengeSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(1),
});
