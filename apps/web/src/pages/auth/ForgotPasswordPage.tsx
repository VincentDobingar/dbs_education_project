import { Button } from "@edumanage/ui";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { requestPasswordReset } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";

import { LOGIN_PATH_BY_SPACE, parseSpace } from "./passwordResetSpaces.js";

/** Étape 1 : demander un lien de réinitialisation, envoyé à l'adresse du compte. */
export function ForgotPasswordPage(): ReactNode {
  const { t, i18n } = useTranslation("app");
  const [searchParams] = useSearchParams();
  const space = parseSpace(searchParams.get("espace"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t("passwordReset.error.email"));
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      await requestPasswordReset(email.trim(), space, i18n.language.startsWith("en") ? "en" : "fr");
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      setError(
        caught instanceof ApiError && caught.status === 429
          ? t("passwordReset.error.tooMany")
          : t("passwordReset.error.generic"),
      );
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("passwordReset.forgot.title")}</h1>
      {status === "sent" ? (
        <div
          role="status"
          className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-medium">{t("passwordReset.forgot.sentTitle")}</p>
          <p className="mt-1">{t("passwordReset.forgot.sentBody")}</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">{t("passwordReset.forgot.subtitle")}</p>
          <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4" noValidate>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.email")}
              <input
                type="email"
                autoComplete="email"
                className="input mt-1"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" variant="secondary" disabled={status === "sending"}>
              {status === "sending" ? t("passwordReset.forgot.sending") : t("passwordReset.forgot.submit")}
            </Button>
          </form>
        </>
      )}
      <p className="mt-8 text-sm">
        <Link to={LOGIN_PATH_BY_SPACE[space]} className="text-brand-teal hover:underline">
          {t("passwordReset.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
