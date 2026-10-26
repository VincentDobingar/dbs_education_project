import { Eye, EyeOff } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useState } from "react";
import { useTranslation } from "react-i18next";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Champ mot de passe avec bouton « Afficher » : évite les erreurs de saisie sur
 * téléphone et permet de voir si le navigateur a prérempli un autre mot de passe.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className = "", ...props },
  ref,
): ReactNode {
  const { t } = useTranslation("app");
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input ref={ref} type={visible ? "text" : "password"} className={`${className} pr-11`} {...props} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? t("password.hide") : t("password.show")}
        aria-pressed={visible}
        className="absolute bottom-0 right-1 flex h-10 w-9 items-center justify-center text-slate-400 hover:text-slate-700"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </span>
  );
});
