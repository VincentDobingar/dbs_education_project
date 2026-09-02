import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { login, onboardTenant, registerAccount, verifyEmail } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";

const COUNTRIES = [
  { iso: "CM", currency: "XAF", nameFr: "Cameroun", nameEn: "Cameroon" },
  { iso: "GA", currency: "XAF", nameFr: "Gabon", nameEn: "Gabon" },
  { iso: "CG", currency: "XAF", nameFr: "Congo", nameEn: "Congo" },
  { iso: "TD", currency: "XAF", nameFr: "Tchad", nameEn: "Chad" },
  { iso: "KE", currency: "KES", nameFr: "Kenya", nameEn: "Kenya" },
  { iso: "TZ", currency: "TZS", nameFr: "Tanzanie", nameEn: "Tanzania" },
  { iso: "UG", currency: "UGX", nameFr: "Ouganda", nameEn: "Uganda" },
  { iso: "CI", currency: "XOF", nameFr: "Côte d'Ivoire", nameEn: "Ivory Coast" },
  { iso: "SN", currency: "XOF", nameFr: "Sénégal", nameEn: "Senegal" },
] as const;

const SCHOOL_PLANS = ["SCHOOL_ESSENTIAL", "SCHOOL_PROFESSIONAL", "SCHOOL_PREMIUM"] as const;

const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  schoolName: z.string().min(2),
  ownershipType: z.enum(["PUBLIC", "PRIVATE"]),
  countryIsoCode: z.string().length(2),
  city: z.string().optional(),
  subdomain: z.string().min(3).max(63).regex(SUBDOMAIN_PATTERN),
  planCode: z.string().optional(),
  promoCode: z.string().optional(),
});

type SignupValues = z.infer<typeof signupSchema>;

const STEP_FIELDS: Record<number, (keyof SignupValues)[]> = {
  0: ["email", "password", "firstName", "lastName"],
  1: ["schoolName", "ownershipType", "countryIsoCode", "city", "subdomain"],
  2: ["planCode", "promoCode"],
};

const STEP_KEYS = [
  "signup.step.account",
  "signup.step.school",
  "signup.step.plan",
  "signup.step.review",
] as const;

export function SignupPage(): ReactNode {
  const { t } = useTranslation("marketing");
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ subdomain: string } | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { ownershipType: "PRIVATE", countryIsoCode: "CM" },
  });

  const values = watch();
  const selectedCountry = COUNTRIES.find((country) => country.iso === values.countryIsoCode) ?? COUNTRIES[0];

  async function goNext(): Promise<void> {
    const fields = STEP_FIELDS[step];
    const valid = fields ? await trigger(fields) : true;
    if (valid) {
      setStep((current) => current + 1);
    }
  }

  function goBack(): void {
    setStep((current) => Math.max(0, current - 1));
  }

  const onSubmit = handleSubmit(async (formValues) => {
    setSubmitError(null);
    try {
      let accessToken: string;
      try {
        const registered = await registerAccount({
          email: formValues.email,
          password: formValues.password,
          firstName: formValues.firstName,
          lastName: formValues.lastName,
        });
        // Le compte démarre PENDING (§34, vérification email obligatoire) — login le
        // refuserait sinon. Aucun fournisseur email réel n'étant branché par défaut, le
        // jeton renvoyé par l'inscription est consommé immédiatement plutôt que
        // d'attendre un email qui ne partira jamais.
        await verifyEmail(registered.emailVerificationToken);
        accessToken = (await login(formValues.email, formValues.password)).accessToken;
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "EMAIL_ALREADY_REGISTERED") {
          throw error;
        }
        // Une soumission précédente a déjà créé ce compte (retry après une coupure
        // réseau, ou double clic) — on ne bloque pas sur une inscription en double,
        // on se reconnecte simplement avec les identifiants déjà fournis.
        accessToken = (await login(formValues.email, formValues.password)).accessToken;
      }
      const onboarded = await onboardTenant(
        {
          name: formValues.schoolName,
          ownershipType: formValues.ownershipType,
          countryIsoCode: formValues.countryIsoCode,
          currencyIsoCode: selectedCountry.currency,
          subdomain: formValues.subdomain,
          ...(formValues.city ? { city: formValues.city } : {}),
          ...(formValues.planCode ? { planCode: formValues.planCode, billingPeriod: "MONTHLY" } : {}),
          ...(formValues.planCode && formValues.promoCode ? { promoCode: formValues.promoCode } : {}),
        },
        accessToken,
      );
      setResult({ subdomain: onboarded.subdomain });
    } catch (error) {
      if (error instanceof ApiError && error.code === "SUBDOMAIN_TAKEN") {
        setSubmitError(t("signup.error.subdomainTaken"));
        setStep(1);
        return;
      }
      if (error instanceof ApiError && error.code.startsWith("PROMOTION_CODE_")) {
        setSubmitError(t("signup.error.promoCodeInvalid"));
        setStep(2);
        return;
      }
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        // Ne peut venir que du login() de repli après EMAIL_ALREADY_REGISTERED (§34) :
        // ce compte existe déjà mais avec un autre mot de passe que celui saisi ici.
        setSubmitError(t("signup.error.emailTakenWrongPassword"));
        setStep(0);
        return;
      }
      setSubmitError(t("signup.error.generic"));
    }
  });

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-bold text-slate-900">{t("signup.success.title")}</h1>
        <p className="mt-4 text-slate-600">{t("signup.success.subtitle")}</p>
        <p className="mt-6 rounded-md bg-slate-100 p-4 font-mono text-sm text-slate-700">
          {result.subdomain}.edumanage.africa
        </p>
        <Link
          to="/connexion"
          className="mt-6 inline-block rounded-md bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-400"
        >
          {t("signup.success.login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("signup.title")}</h1>

      <ol className="mt-6 flex gap-4 text-sm">
        {STEP_KEYS.map((key, index) => (
          <li key={key} className={index === step ? "font-semibold text-brand-teal" : "text-slate-400"}>
            {index + 1}. {t(key)}
          </li>
        ))}
      </ol>

      {submitError ? <p className="mt-4 text-sm text-red-600">{submitError}</p> : null}

      <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4" noValidate>
        {step === 0 ? (
          <>
            <Field label={t("signup.account.firstName")} error={errors.firstName?.message}>
              <input type="text" className="input" {...register("firstName")} />
            </Field>
            <Field label={t("signup.account.lastName")} error={errors.lastName?.message}>
              <input type="text" className="input" {...register("lastName")} />
            </Field>
            <Field label={t("signup.account.email")} error={errors.email?.message}>
              <input type="email" className="input" {...register("email")} />
            </Field>
            <Field label={t("signup.account.password")} error={errors.password?.message}>
              <input type="password" className="input" {...register("password")} />
            </Field>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field label={t("signup.school.name")} error={errors.schoolName?.message}>
              <input type="text" className="input" {...register("schoolName")} />
            </Field>
            <Field label={t("signup.school.ownershipType")}>
              <select className="input" {...register("ownershipType")}>
                <option value="PRIVATE">{t("signup.school.ownershipType.private")}</option>
                <option value="PUBLIC">{t("signup.school.ownershipType.public")}</option>
              </select>
            </Field>
            <Field label={t("signup.school.country")}>
              <select className="input" {...register("countryIsoCode")}>
                {COUNTRIES.map((country) => (
                  <option key={country.iso} value={country.iso}>
                    {country.nameFr}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("signup.school.city")}>
              <input type="text" className="input" {...register("city")} />
            </Field>
            <Field label={t("signup.school.subdomain")} error={errors.subdomain?.message}>
              <input type="text" className="input" {...register("subdomain")} />
              <p className="mt-1 text-xs text-slate-500">
                {t("signup.school.subdomainHint", { subdomain: values.subdomain || "…" })}
              </p>
            </Field>
          </>
        ) : null}

        {step === 2 ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-700">{t("signup.plan.label")}</legend>
            {SCHOOL_PLANS.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input type="radio" value={code} {...register("planCode")} />
                {t(`pricing.plan.${code}.name`)}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-500">
              <input type="radio" value="" defaultChecked {...register("planCode")} />
              {t("signup.plan.skip")}
            </label>
            {values.planCode ? (
              <Field label={t("signup.plan.promoCode.label")}>
                <input type="text" className="input" {...register("promoCode")} />
              </Field>
            ) : null}
          </fieldset>
        ) : null}

        {step === 3 ? (
          <div className="space-y-2 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
            <h2 className="font-semibold text-slate-900">{t("signup.review.title")}</h2>
            <p>
              {values.firstName} {values.lastName} — {values.email}
            </p>
            <p>
              {values.schoolName} ({selectedCountry.nameFr})
            </p>
            <p>{values.subdomain}.edumanage.africa</p>
          </div>
        ) : null}

        <div className="flex justify-between pt-4">
          {step > 0 ? (
            <Button type="button" variant="primary" onClick={goBack}>
              {t("signup.back")}
            </Button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <Button type="button" variant="secondary" onClick={() => void goNext()}>
              {t("signup.next")}
            </Button>
          ) : (
            // type="button" + explicit onSubmit() call, not type="submit": the step-2
            // "Continuer" button occupies this exact same flex-slot position, and React
            // reconciles it into the very same <button> DOM node when step advances to 3
            // rather than mounting a new one. If that button were type="submit", the
            // browser resolves the native click-to-submit default action against the
            // node's CURRENT (post-render) type — so a single click advancing step 2->3
            // could flip the element to type="submit" synchronously during that same
            // click and silently auto-submit the form before the user ever saw the
            // review step. Keeping this button type="button" everywhere removes the only
            // path a click on it could submit natively.
            <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void onSubmit()}>
              {isSubmitting ? t("signup.submitting") : t("signup.submit")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        <div className="mt-1">{children}</div>
      </label>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
