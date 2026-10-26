import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { MfaStep } from "../../components/MfaStep.js";
import type { AuthTokens, MfaPending } from "../../lib/api.js";
import { getCurrentUser, isAuthTokens, loginStart } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";
import { saveSession } from "../../lib/session.js";

const loginSchema = z.object({
  subdomain: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage(): ReactNode {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // §34 : SCHOOL_OWNER/SCHOOL_ADMIN/ACCOUNTANT/HR_MANAGER sont des rôles sensibles —
  // leur connexion passe par le second facteur (MfaStep).
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

  async function completeLogin(tokens: AuthTokens, subdomain: string): Promise<void> {
    const profile = await getCurrentUser(tokens.accessToken);
    const membership = profile.tenantMemberships.find((candidate) => candidate.subdomain === subdomain);
    if (!membership) {
      setMfa(null);
      setSubmitError(t("login.error.notMember"));
      return;
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    saveSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      subdomain: membership.subdomain,
      tenantId: membership.tenantId,
      tenantName: membership.tenantName,
      email: profile.email,
      roleCodes: membership.roleCodes,
    });
    void navigate("/tableau-de-bord");
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const result = await loginStart(values.email, values.password);
      if (isAuthTokens(result)) {
        await completeLogin(result, values.subdomain);
        return;
      }
      setMfa({ pending: result, credentials: values });
    } catch (error) {
      setSubmitError(describeLoginError(error));
    }
  });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("login.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("login.subtitle")}</p>

      {submitError ? <p className="mt-4 text-sm text-red-600">{submitError}</p> : null}

      {mfa ? (
        <MfaStep
          pending={mfa.pending}
          relogin={() => loginStart(mfa.credentials.email, mfa.credentials.password)}
          onAuthenticated={(tokens) => completeLogin(tokens, mfa.credentials.subdomain)}
          onCancel={() => setMfa(null)}
        />
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.subdomain")}
              <div className="mt-1 flex items-center">
                <input type="text" className="input rounded-r-none" {...register("subdomain")} />
                <span className="whitespace-nowrap rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  .edumanage.africa
                </span>
              </div>
            </label>
            {errors.subdomain ? (
              <p className="mt-1 text-sm text-red-600">{errors.subdomain.message}</p>
            ) : null}
          </div>

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
              <input
                type="password"
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
        </form>
      )}
    </div>
  );
}
