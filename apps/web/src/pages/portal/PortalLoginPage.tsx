import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { login, registerAccount, verifyEmail } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";
import { savePortalSession } from "../../lib/portalSession.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export function PortalLoginPage(): ReactNode {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });

  async function completeLogin(email: string, password: string): Promise<void> {
    const tokens = await login(email, password);
    savePortalSession({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, email });
    void navigate("/portail/activation");
  }

  const onLogin = loginForm.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await completeLogin(values.email, values.password);
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setSubmitError(t("portal.error.invalidCredentials"));
      } else if (error instanceof ApiError && error.code === "ACCOUNT_NOT_ACTIVE") {
        setSubmitError(t("portal.error.accountNotActive"));
      } else {
        setSubmitError(t("portal.error.generic"));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  const onRegister = registerForm.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await registerAccount(values);
      // No real email provider is configured yet (§34) — the token is handed back in
      // the response precisely so the caller can consume it immediately instead of
      // waiting on an email that will never arrive, same pattern as the school signup
      // wizard.
      await verifyEmail(result.emailVerificationToken);
      await completeLogin(values.email, values.password);
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_ALREADY_REGISTERED") {
        setSubmitError(t("portal.error.emailTaken"));
      } else {
        setSubmitError(t("portal.error.generic"));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("portal.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {mode === "login" ? t("portal.login.subtitle") : t("portal.register.subtitle")}
      </p>

      {submitError ? <p className="mt-4 text-sm text-red-600">{submitError}</p> : null}

      {mode === "login" ? (
        <form onSubmit={(event) => void onLogin(event)} className="mt-8 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.email")}
              <input type="email" className="input mt-1" {...loginForm.register("email")} />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.password")}
              <input type="password" className="input mt-1" {...loginForm.register("password")} />
            </label>
          </div>
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void onLogin()}>
            {isSubmitting ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>
      ) : (
        <form onSubmit={(event) => void onRegister(event)} className="mt-8 space-y-4" noValidate>
          <div className="flex gap-3">
            <label className="block flex-1 text-sm font-medium text-slate-700">
              {t("users.firstName")}
              <input className="input mt-1" {...registerForm.register("firstName")} />
            </label>
            <label className="block flex-1 text-sm font-medium text-slate-700">
              {t("users.lastName")}
              <input className="input mt-1" {...registerForm.register("lastName")} />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.email")}
              <input type="email" className="input mt-1" {...registerForm.register("email")} />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.password")}
              <input type="password" className="input mt-1" {...registerForm.register("password")} />
            </label>
          </div>
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void onRegister()}>
            {isSubmitting ? t("login.submitting") : t("portal.register.submit")}
          </Button>
        </form>
      )}

      <button
        type="button"
        className="mt-6 text-sm text-brand-teal hover:underline"
        onClick={() => {
          setSubmitError(null);
          setMode(mode === "login" ? "register" : "login");
        }}
      >
        {mode === "login" ? t("portal.switchToRegister") : t("portal.switchToLogin")}
      </button>
    </div>
  );
}
