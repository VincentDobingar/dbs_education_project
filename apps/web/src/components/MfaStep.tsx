import { Button } from "@edumanage/ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AuthTokens, LoginResult, MfaPending, MfaSetupResult } from "../lib/api.js";
import {
  enableMfaWithEnrollmentToken,
  isAuthTokens,
  setupMfaWithEnrollmentToken,
  verifyMfaChallenge,
} from "../lib/api.js";
import { ApiError } from "../lib/apiClient.js";

type Stage =
  | { kind: "challenge"; challengeToken: string }
  | { kind: "enrollLoading"; enrollmentToken: string }
  | { kind: "enroll"; enrollmentToken: string; setup: MfaSetupResult }
  | { kind: "recoveryCodes"; codes: string[] };

interface MfaStepProps {
  /** Réponse de POST /auth/login exigeant un second facteur. */
  pending: MfaPending;
  /**
   * Rejoue POST /auth/login avec les identifiants déjà saisis : après l'activation
   * du MFA, l'API exige une nouvelle connexion (défi MFA normal) avant d'émettre
   * une vraie session (§34, auth.service.ts).
   */
  relogin: () => Promise<LoginResult>;
  onAuthenticated: (tokens: AuthTokens) => Promise<void>;
  onCancel: () => void;
}

function initialStage(pending: MfaPending): Stage {
  return "challengeToken" in pending
    ? { kind: "challenge", challengeToken: pending.challengeToken }
    : { kind: "enrollLoading", enrollmentToken: pending.enrollmentToken };
}

function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Second facteur à la connexion (§34) : saisie du code TOTP quand le MFA est
 * actif, ou inscription obligatoire (clé secrète → premier code → codes de
 * secours) pour un rôle sensible qui ne l'a pas encore configuré.
 */
export function MfaStep({ pending, relogin, onAuthenticated, onCancel }: MfaStepProps): ReactNode {
  const { t } = useTranslation("app");
  const [stage, setStage] = useState<Stage>(() => initialStage(pending));
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enrollmentTokenToSetup = stage.kind === "enrollLoading" ? stage.enrollmentToken : null;

  useEffect(() => {
    if (!enrollmentTokenToSetup) return;
    let cancelled = false;
    setupMfaWithEnrollmentToken(enrollmentTokenToSetup)
      .then((setup) => {
        if (!cancelled) setStage({ kind: "enroll", enrollmentToken: enrollmentTokenToSetup, setup });
      })
      .catch(() => {
        if (!cancelled) setError(t("mfa.error.sessionExpired"));
      });
    return () => {
      cancelled = true;
    };
  }, [enrollmentTokenToSetup, t]);

  function describeError(caught: unknown): string {
    if (caught instanceof ApiError && caught.code === "INVALID_MFA_CODE") return t("mfa.error.invalidCode");
    if (caught instanceof ApiError && (caught.code === "INVALID_MFA_CHALLENGE" || caught.status === 401)) {
      return t("mfa.error.sessionExpired");
    }
    return t("login.error.generic");
  }

  async function submitCode(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = code.replace(/\s+/g, "");
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      if (stage.kind === "challenge") {
        const tokens = await verifyMfaChallenge(stage.challengeToken, trimmed);
        await onAuthenticated(tokens);
        return;
      }
      if (stage.kind === "enroll") {
        const { recoveryCodes } = await enableMfaWithEnrollmentToken(stage.enrollmentToken, trimmed);
        setCode("");
        setStage({ kind: "recoveryCodes", codes: recoveryCodes });
      }
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterRecoveryCodes(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await relogin();
      if (isAuthTokens(result)) {
        await onAuthenticated(result);
        return;
      }
      if ("challengeToken" in result) {
        setStage({ kind: "challenge", challengeToken: result.challengeToken });
        return;
      }
      setError(t("login.error.generic"));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const codeForm = (
    <form onSubmit={(event) => void submitCode(event)} className="mt-6 space-y-4" noValidate>
      <label className="block text-sm font-medium text-slate-700">
        {t("mfa.code")}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="input mt-1 tracking-widest"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? t("login.submitting") : t("mfa.submit")}
        </Button>
        <button type="button" className="text-sm text-slate-500 underline" onClick={onCancel}>
          {t("mfa.cancel")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="mt-8">
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {stage.kind === "challenge" ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">{t("mfa.challenge.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("mfa.challenge.subtitle")}</p>
          {codeForm}
        </>
      ) : null}

      {stage.kind === "enrollLoading" ? (
        <>
          <p className="text-sm text-slate-600">{t("mfa.enroll.loading")}</p>
          <button type="button" className="mt-4 text-sm text-slate-500 underline" onClick={onCancel}>
            {t("mfa.cancel")}
          </button>
        </>
      ) : null}

      {stage.kind === "enroll" ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">{t("mfa.enroll.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("mfa.enroll.subtitle")}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>{t("mfa.enroll.step1")}</li>
            <li>
              {t("mfa.enroll.step2")}
              <code className="mt-2 block select-all break-all rounded-md bg-slate-100 px-3 py-2 font-mono text-base text-slate-900">
                {formatSecret(stage.setup.secret)}
              </code>
              <a href={stage.setup.otpauthUri} className="mt-1 inline-block text-sm text-teal-700 underline">
                {t("mfa.enroll.openApp")}
              </a>
            </li>
            <li>{t("mfa.enroll.step3")}</li>
          </ol>
          {codeForm}
        </>
      ) : null}

      {stage.kind === "recoveryCodes" ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">{t("mfa.recovery.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("mfa.recovery.subtitle")}</p>
          <ul className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-4 font-mono text-sm text-slate-900">
            {stage.codes.map((recoveryCode) => (
              <li key={recoveryCode} className="select-all">
                {recoveryCode}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void continueAfterRecoveryCodes()}
            >
              {busy ? t("login.submitting") : t("mfa.recovery.continue")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
