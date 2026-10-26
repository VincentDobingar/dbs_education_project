import { z } from "zod";

// Adresses comparées en minuscules et sans espaces : le clavier des téléphones met
// souvent une majuscule en tête de champ.
const emailSchema = z.string().trim().toLowerCase().email();

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(12),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const verifyPhoneSchema = z.object({
  email: emailSchema,
  code: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

/** Espace d'où vient la demande : décide de la page de connexion proposée après coup. */
export const passwordResetSpaces = ["staff", "portal", "admin"] as const;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  space: z.enum(passwordResetSpaces).default("staff"),
  locale: z.enum(["fr", "en"]).default("fr"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  // Même règle que l'inscription (registerSchema).
  password: z.string().min(12),
});
