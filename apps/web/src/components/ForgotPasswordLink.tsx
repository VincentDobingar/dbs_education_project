import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { PasswordResetSpace } from "../lib/api.js";

/** « Mot de passe oublié ? » sous un formulaire de connexion, en gardant l'espace d'origine. */
export function ForgotPasswordLink({ space }: { space: PasswordResetSpace }): ReactNode {
  const { t } = useTranslation("app");
  return (
    <p className="text-sm">
      <Link to={`/mot-de-passe-oublie?espace=${space}`} className="text-brand-teal hover:underline">
        {t("passwordReset.forgotLink")}
      </Link>
    </p>
  );
}
