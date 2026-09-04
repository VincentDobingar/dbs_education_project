import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { createFamilyAccount, getFamilyAccount } from "../../lib/familyApi.js";
import { getParentDashboard } from "../../lib/parentPortalApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";
import {
  createFamilyInvoice,
  createFamilyPaymentIntent,
  createFamilySubscription,
  getFamilySubscription,
  recordFamilyCashPayment,
} from "../../lib/subscriptionApi.js";

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

const FAMILY_PLANS = ["PARENT_BASIC", "PARENT_PREMIUM", "FAMILY_PLAN"] as const;

function FamilySubscriptionSection(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const accessToken = session?.accessToken as string;
  const queryClient = useQueryClient();

  const familyAccount = useQuery({
    queryKey: ["family-account", accessToken],
    queryFn: async () => {
      try {
        return await getFamilyAccount(accessToken);
      } catch {
        return null;
      }
    },
  });
  const subscription = useQuery({
    queryKey: ["family-subscription", accessToken],
    queryFn: () => getFamilySubscription(accessToken),
    enabled: Boolean(familyAccount.data),
  });

  const [planCode, setPlanCode] = useState<string>(FAMILY_PLANS[0]);
  const [error, setError] = useState<string | null>(null);

  const createAccountMutation = useMutation({
    mutationFn: () => createFamilyAccount(undefined, accessToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["family-account", accessToken] }),
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      await createFamilySubscription({ planCode, billingPeriod: "MONTHLY" }, accessToken);
      const invoice = await createFamilyInvoice(
        { currencyIsoCode: "XAF", billingName: session?.email ?? "", billingEmail: session?.email ?? "" },
        accessToken,
      );
      const intent = await createFamilyPaymentIntent(invoice.id, accessToken);
      await recordFamilyCashPayment(intent.id, accessToken);
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["family-subscription", accessToken] });
    },
    onError: () => setError(t("portal.subscription.error.generic")),
  });

  if (familyAccount.isPending) {
    return <p className="text-sm text-slate-500">{t("students.loading")}</p>;
  }

  if (!familyAccount.data) {
    return (
      <div>
        <p className="text-sm text-slate-600">{t("portal.subscription.noFamilyAccount")}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => createAccountMutation.mutate()}
        >
          {t("portal.subscription.createFamilyAccount")}
        </Button>
      </div>
    );
  }

  if (subscription.data) {
    return (
      <p className="text-sm text-slate-700">
        {t("portal.subscription.status")}:{" "}
        <strong>{t(`portal.subscriptionStatus.${subscription.data.status}`)}</strong>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("portal.subscription.none")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <select className="input w-48" value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
          {FAMILY_PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          disabled={subscribeMutation.isPending}
          onClick={() => subscribeMutation.mutate()}
        >
          {subscribeMutation.isPending
            ? t("portal.subscription.subscribing")
            : t("portal.subscription.subscribe")}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function ParentDashboardPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const accessToken = session?.accessToken as string;

  const dashboard = useQuery({
    queryKey: ["parent-dashboard", accessToken],
    queryFn: () => getParentDashboard(accessToken),
  });

  if (dashboard.isPending) {
    return <p className="mx-auto max-w-4xl px-6 py-10 text-sm text-slate-500">{t("students.loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("portal.nav.parent")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("portal.parent.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.subscription.title")}</h2>
        <div className="mt-3">
          <FamilySubscriptionSection />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.parent.children")}</h2>

        {(dashboard.data?.children ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            {t("portal.parent.noChildren")}{" "}
            <Link to="/portail/activation" className="text-brand-teal hover:underline">
              {t("portal.nav.redeem")}
            </Link>
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {(dashboard.data?.children ?? []).map((child) => (
              <div key={child.student.id} className="rounded-md border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {child.student.firstName} {child.student.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{child.tenantName}</p>
                  </div>
                  <Link
                    to={`/portail/parent/enfants/${child.student.id}`}
                    className="text-sm text-brand-teal hover:underline"
                  >
                    {t("portal.parent.viewChild")}
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-slate-500">{t("studentDetail.outstanding")}</p>
                    <p className="font-medium text-slate-900">
                      {formatAmount(child.financialSituation.outstandingCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t("portal.parent.latestReportCard")}</p>
                    <p className="font-medium text-slate-900">
                      {child.latestReportCard?.averageScore ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t("portal.parent.announcements")}</p>
                    <p className="font-medium text-slate-900">{child.announcements.length}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
