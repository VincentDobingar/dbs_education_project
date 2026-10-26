import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { ForgotPasswordLink } from "../../components/ForgotPasswordLink.js";
import { MfaStep } from "../../components/MfaStep.js";
import { PasswordInput } from "../../components/PasswordInput.js";
import { saveAdminSession } from "../../lib/adminSession.js";
import type { AuthTokens, MfaPending } from "../../lib/api.js";
import { getCurrentUser, isAuthTokens, loginStart } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Pas de champ subdomain (contrairement à LoginPage.tsx) : un compte plateforme
 * (§31) n'appartient à aucun tenant. requirePlatformRole ne s'exprime nulle part
 * dans le JWT (qui ne porte que `sub`) — GET /auth/me après connexion est la seule
 * façon de savoir si ce compte a un rôle plateforme, donc si /admin doit s'ouvrir.
 * Tout rôle plateforme est sensible (authorization.ts) : la connexion passe donc
 * toujours par le second facteur (§34, MfaStep).
 */
export function AdminLoginPage(): ReactNode {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ pending: MfaPending; credentials: LoginValues } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  function describeLoginError(error: unknown): string {
    if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
      return t("login.error.invalidCredentials");
    }
    if (error instanceof ApiError && error.code === "ACCOUNT_NOT_ACTIVE") {
      return t("login.error.accountNotActive");
    }
    if (error instanceof ApiError && error.code === "ACCOUNT_LOCKED") {
      return t("login.error.accountLocked");
    }
    return t("login.error.generic");
  }

  async function completeLogin(tokens: AuthTokens): Promise<void> {
    const profile = await getCurrentUser(tokens.accessToken);
    if (profile.platformRoleCodes.length === 0) {
      setMfa(null);
      setSubmitError(t("admin.login.error.notPlatformAccount"));
      return;
    }
    saveAdminSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: profile.email,
      platformRoleCodes: profile.platformRoleCodes,
    });
    void navigate("/admin");
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const result = await loginStart(values.email, values.password);
      if (isAuthTokens(result)) {
        await completeLogin(result);
        return;
      }
      setMfa({ pending: result, credentials: values });
    } catch (error) {
      setSubmitError(describeLoginError(error));
    }
  });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("admin.login.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("admin.login.subtitle")}</p>

      {submitError ? <p className="mt-4 text-sm text-red-600">{submitError}</p> : null}

      {mfa ? (
        <MfaStep
          pending={mfa.pending}
          relogin={() => loginStart(mfa.credentials.email, mfa.credentials.password)}
          onAuthenticated={completeLogin}
          onCancel={() => setMfa(null)}
        />
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.email")}
              <input type="email" autoComplete="email" className="input mt-1" {...register("email")} />
            </label>
            {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email.message}</p> : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.password")}
              <PasswordInput
                autoComplete="current-password"
                className="input mt-1"
                {...register("password")}
              />
            </label>
            {errors.password ? <p className="mt-1 text-sm text-red-600">{errors.password.message}</p> : null}
          </div>

          <Button type="submit" variant="secondary" disabled={isSubmitting}>
            {isSubmitting ? t("login.submitting") : t("login.submit")}
          </Button>
          <ForgotPasswordLink space="admin" />
        </form>
      )}
    </div>
  );
}
