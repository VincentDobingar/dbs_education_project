import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getParentDashboard } from "../../lib/parentPortalApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function ParentDashboardPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const accessToken = session?.accessToken as string;

  const dashboard = useQuery({
    queryKey: ["parent-dashboard", accessToken],
    queryFn: () => getParentDashboard(accessToken),
    networkMode: "always",
    gcTime: 0,
    retry: false,
    refetchInterval: 60_000,
  });

  if (dashboard.isPending || dashboard.fetchStatus !== "idle") {
    return <p className="mx-auto max-w-4xl px-6 py-10 text-sm text-slate-500">{t("students.loading")}</p>;
  }
  if (dashboard.isError)
    return (
      <p role="alert" className="px-6 py-10 text-red-600">
        Impossible de vérifier votre couverture. Reconnectez-vous au réseau pour accéder aux données de vos
        enfants.
      </p>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="rounded-2xl border border-teal-200 bg-teal-50 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Espace parent / tuteur</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Le suivi de mes enfants</h1>
        <p className="mt-2 text-slate-600">
          Résultats, présences et finances de vos enfants dans leurs établissements.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.subscription.title")}</h2>
        <div className="mt-3">
          <Link to="/portail/abonnements" className="text-brand-teal underline">
            Gérer mes abonnements et les enfants couverts
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.parent.children")}</h2>

        {(dashboard.data?.children ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Aucun enfant couvert par un abonnement actif. Rendez-vous dans « Mes abonnements » pour
            sélectionner vos enfants et établissements.{" "}
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
