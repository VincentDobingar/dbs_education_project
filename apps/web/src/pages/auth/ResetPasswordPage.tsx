import { Button } from "@edumanage/ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { resetPassword } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";

import { LOGIN_PATH_BY_SPACE, parseSpace } from "./passwordResetSpaces.js";

const MIN_PASSWORD_LENGTH = 12;

/** Lit le jeton dans le fragment (#token=…) du lien envoyé par e-mail. */
function readToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && token.length > 0 ? token : null;
}

/** Étape 2 : choisir un nouveau mot de passe depuis le lien reçu par e-mail. */
export function ResetPasswordPage(): ReactNode {
  const { t } = useTranslation("app");
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const space = parseSpace(searchParams.get("espace"));
  const [token] = useState(() => readToken(location.hash));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(token === null);

  // Le jeton est gardé en mémoire : on le retire de la barre d'adresse (historique,
  // capture d'écran, partage de l'URL).
  useEffect(() => {
    if (location.hash) {
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }, [location.hash, location.pathname, location.search]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordReset.error.tooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmation) {
      setError(t("passwordReset.error.mismatch"));
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await resetPassword(token!, password);
      setStatus("done");
    } catch (caught) {
      setStatus("idle");
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 410)) {
        setLinkInvalid(true);
      } else {
        setError(t("passwordReset.error.generic"));
      }
    }
  }

  const loginPath = LOGIN_PATH_BY_SPACE[space];

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("passwordReset.reset.title")}</h1>

      {status === "done" ? (
        <div
          role="status"
          className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-medium">{t("passwordReset.reset.doneTitle")}</p>
          <p className="mt-1">{t("passwordReset.reset.doneBody")}</p>
          <Link to={loginPath} className="mt-4 inline-block font-semibold text-emerald-900 underline">
            {t("login.submit")}
          </Link>
        </div>
      ) : linkInvalid ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">{t("passwordReset.reset.invalidTitle")}</p>
          <p className="mt-1">{t("passwordReset.reset.invalidBody")}</p>
          <Link
            to={`/mot-de-passe-oublie?espace=${space}`}
            className="mt-4 inline-block font-semibold text-amber-900 underline"
          >
            {t("passwordReset.reset.requestNew")}
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            {t("passwordReset.reset.subtitle", { count: MIN_PASSWORD_LENGTH })}
          </p>
          <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4" noValidate>
            <label className="block text-sm font-medium text-slate-700">
              {t("passwordReset.reset.newPassword")}
              <input
                type="password"
                autoComplete="new-password"
                className="input mt-1"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {t("passwordReset.reset.confirmPassword")}
              <input
                type="password"
                autoComplete="new-password"
                className="input mt-1"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" variant="secondary" disabled={status === "saving"}>
              {status === "saving" ? t("passwordReset.reset.saving") : t("passwordReset.reset.submit")}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
