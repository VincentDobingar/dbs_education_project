import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/apiClient.js";
import {
  ACCESS_GRANTING_STATUSES,
  cancelSchoolSubscription,
  CANCELLABLE_BY_SCHOOL_STATUSES,
  createSchoolSubscription,
  ENDED_STATUSES,
  getSchoolSubscription,
  SCHOOL_PLAN_CODES,
  type SchoolPlanCode,
  type SchoolSubscription,
} from "../../lib/schoolSubscriptionApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

// Prix mensuels indicatifs, alignés sur prisma/seed/data/plan-prices.ts (XAF, sans
// sous-unité). Affichage seulement : le montant facturé est toujours résolu côté API.
const MONTHLY_PRICE_XAF: Record<SchoolPlanCode, number> = {
  SCHOOL_ESSENTIAL: 25_000,
  SCHOOL_PROFESSIONAL: 65_000,
  SCHOOL_PREMIUM: 150_000,
};

function formatDate(value: string | null, locale: string): string | null {
  return value ? new Date(value).toLocaleDateString(locale) : null;
}

function statusTone(status: SchoolSubscription["status"]): string {
  if (ACCESS_GRANTING_STATUSES.has(status)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (ENDED_STATUSES.has(status) || status === "SUSPENDED") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function CurrentSubscription({
  subscription,
  onCancel,
  isCancelling,
}: {
  subscription: SchoolSubscription;
  onCancel: () => void;
  isCancelling: boolean;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const planName = subscription.plan
    ? i18n.language.startsWith("en")
      ? subscription.plan.nameEn
      : subscription.plan.nameFr
    : "—";
  const trialEnds = formatDate(subscription.trialEndsAt, i18n.language);
  const periodEnds = formatDate(subscription.currentPeriodEndsAt, i18n.language);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{t("subscription.current.plan")}</p>
          <p className="text-lg font-semibold text-slate-900">{planName}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${statusTone(subscription.status)}`}
        >
          {t(`admin.subscriptions.status.${subscription.status}`)}
        </span>
      </div>

      <p className="mt-4 text-sm text-slate-600">{t(`subscription.explain.${subscription.status}`)}</p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {subscription.status === "TRIAL" && trialEnds ? (
          <div>
            <dt className="text-slate-500">{t("subscription.current.trialEndsAt")}</dt>
            <dd className="font-medium text-slate-900">{trialEnds}</dd>
          </div>
        ) : null}
        {subscription.status === "ACTIVE" && periodEnds ? (
          <div>
            <dt className="text-slate-500">{t("subscription.current.periodEndsAt")}</dt>
            <dd className="font-medium text-slate-900">{periodEnds}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-slate-500">{t("subscription.current.requestedAt")}</dt>
          <dd className="font-medium text-slate-900">{formatDate(subscription.createdAt, i18n.language)}</dd>
        </div>
      </dl>

      {CANCELLABLE_BY_SCHOOL_STATUSES.has(subscription.status) ? (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <button
            type="button"
            className="text-sm text-slate-500 underline hover:text-slate-700"
            disabled={isCancelling}
            onClick={onCancel}
          >
            {t("subscription.changePlan")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Abonnement de l'établissement (§3/§6) : choix d'une formule (abonnement créé en
 * brouillon via POST /subscriptions/school), puis suivi de son statut. L'activation
 * — période d'essai ou confirmation du paiement — est faite par l'équipe DBS depuis
 * la super-administration.
 */
export function SubscriptionPage(): ReactNode {
  const { t } = useTranslation("app");
  const tMarketing = useTranslation("marketing").t;
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<SchoolPlanCode>("SCHOOL_ESSENTIAL");
  const [promoCode, setPromoCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const subscription = useQuery({
    queryKey: ["school-subscription", session.subdomain],
    queryFn: () => getSchoolSubscription(creds),
  });

  function describeError(caught: unknown): string {
    if (caught instanceof ApiError && caught.status === 403) return t("subscription.error.forbidden");
    if (caught instanceof ApiError && caught.code.startsWith("PROMOTION_CODE"))
      return t("subscription.error.promo");
    return t("subscription.error.generic");
  }

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ["school-subscription", session.subdomain] });
    // Le bandeau du layout et les pages protégées dépendent de ce statut.
    void queryClient.invalidateQueries({ queryKey: ["school-subscription-banner", session.subdomain] });
  }

  const create = useMutation({
    mutationFn: () =>
      createSchoolSubscription(
        { planCode: selectedPlan, ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}) },
        creds,
      ),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (caught) => setError(describeError(caught)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelSchoolSubscription(id, creds),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (caught) => setError(describeError(caught)),
  });

  const current = subscription.data;
  const canSubscribe = subscription.isSuccess && (!current || ENDED_STATUSES.has(current.status));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("subscription.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subscription.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {subscription.isPending ? <p className="text-sm text-slate-500">{t("admin.common.loading")}</p> : null}
      {subscription.isError ? (
        <p className="text-sm text-red-600">{describeError(subscription.error)}</p>
      ) : null}

      {current ? (
        <CurrentSubscription
          subscription={current}
          isCancelling={cancel.isPending}
          onCancel={() => cancel.mutate(current.id)}
        />
      ) : null}

      {canSubscribe ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("subscription.choose.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("subscription.choose.subtitle")}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {SCHOOL_PLAN_CODES.map((code) => {
              const isSelected = selectedPlan === code;
              return (
                <label
                  key={code}
                  className={`flex cursor-pointer flex-col rounded-lg border p-5 transition-colors ${
                    isSelected
                      ? "border-brand-teal bg-teal-50/50 ring-1 ring-brand-teal"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {tMarketing(`pricing.plan.${code}.name`)}
                    </span>
                    <input
                      type="radio"
                      name="plan"
                      value={code}
                      checked={isSelected}
                      onChange={() => setSelectedPlan(code)}
                    />
                  </div>
                  <p className="mt-2 text-xl font-bold text-slate-900">
                    {MONTHLY_PRICE_XAF[code].toLocaleString("fr-FR")} FCFA
                    <span className="text-sm font-normal text-slate-500">
                      {" "}
                      / {t("subscription.perMonth")}
                    </span>
                  </p>
                  <p className="mt-2 flex-1 text-sm text-slate-600">
                    {tMarketing(`pricing.plan.${code}.description`)}
                  </p>
                  <p className="mt-3 text-xs font-medium text-emerald-700">
                    {t("subscription.trialIncluded")}
                  </p>
                </label>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-4">
            <label className="block text-sm font-medium text-slate-700">
              {t("subscription.promoCode")}
              <input
                className="input mt-1 block w-56"
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
              />
            </label>
            <Button variant="secondary" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? t("subscription.submitting") : t("subscription.submit")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t("subscription.nextSteps")}</p>
        </section>
      ) : null}
    </div>
  );
}
