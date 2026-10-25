import type { PasswordResetSpace } from "../../lib/api.js";

export const LOGIN_PATH_BY_SPACE: Record<PasswordResetSpace, string> = {
  staff: "/connexion",
  portal: "/portail/connexion",
  admin: "/admin/connexion",
};

export function parseSpace(value: string | null): PasswordResetSpace {
  return value === "portal" || value === "admin" ? value : "staff";
}
