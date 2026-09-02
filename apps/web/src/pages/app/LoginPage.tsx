import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { getCurrentUser, login } from "../../lib/api.js";
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
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const tokens = await login(values.email, values.password);
      const profile = await getCurrentUser(tokens.accessToken);
      const membership = profile.tenantMemberships.find(
        (candidate) => candidate.subdomain === values.subdomain,
      );
      if (!membership) {
        setSubmitError(t("login.error.notMember"));
        return;
      }
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
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setSubmitError(t("login.error.invalidCredentials"));
        return;
      }
      if (error instanceof ApiError && error.code === "ACCOUNT_NOT_ACTIVE") {
        setSubmitError(t("login.error.accountNotActive"));
        return;
      }
      if (error instanceof ApiError && error.code === "ACCOUNT_LOCKED") {
        setSubmitError(t("login.error.accountLocked"));
        return;
      }
      setSubmitError(t("login.error.generic"));
    }
  });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("login.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("login.subtitle")}</p>

      {submitError ? <p className="mt-4 text-sm text-red-600">{submitError}</p> : null}

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
          {errors.subdomain ? <p className="mt-1 text-sm text-red-600">{errors.subdomain.message}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            {t("login.email")}
            <input type="email" className="input mt-1" {...register("email")} />
          </label>
          {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email.message}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            {t("login.password")}
            <input type="password" className="input mt-1" {...register("password")} />
          </label>
          {errors.password ? <p className="mt-1 text-sm text-red-600">{errors.password.message}</p> : null}
        </div>

        <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void onSubmit()}>
          {isSubmitting ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
