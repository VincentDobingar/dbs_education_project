import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getStatsOverview } from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

function formatAmount(amountCents: number, currencyIsoCode: string): string {
  return `${(amountCents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currencyIsoCode}`;
}

function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function Tile({ label, value }: { label: string; value: string | number }): ReactNode {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export function AdminDashboardPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };

  const overview = useQuery({
    queryKey: ["admin-stats-overview"],
    queryFn: () => getStatsOverview(30, creds),
  });

  const data = overview.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.dashboard.subtitle")}</p>
      </div>

      {overview.isLoading ? <p className="text-sm text-slate-500">{t("admin.common.loading")}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label={t("admin.dashboard.tenantsTotal")} value={data.tenants.total} />
            <Tile label={t("admin.dashboard.tenantsActive")} value={data.tenants.active} />
            <Tile label={t("admin.dashboard.subscriptionsTotal")} value={data.subscriptions.total} />
            <Tile
              label={t("admin.dashboard.subscriptionsExpiring")}
              value={data.subscriptions.expiringWithinWindow}
            />
            <Tile label={t("admin.dashboard.licensesAvailable")} value={data.licenses.available} />
            <Tile label={t("admin.dashboard.licensesAssigned")} value={data.licenses.assigned} />
            <Tile label={t("admin.dashboard.conversionRate")} value={formatPercent(data.conversionRate)} />
            <Tile label={t("admin.dashboard.churnRate")} value={formatPercent(data.churnRate)} />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{t("admin.dashboard.revenue30d")}</h2>
            {data.revenue.byCurrency.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t("admin.common.empty")}</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {data.revenue.byCurrency.map((bucket) => (
                  <li key={bucket.currencyIsoCode}>
                    {formatAmount(bucket.amountCents, bucket.currencyIsoCode)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("admin.dashboard.failedPayments30d")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{data.failedPayments}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{t("admin.dashboard.tenantsByStatus")}</h2>
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {Object.entries(data.tenants.byStatus)
                  .filter(([, count]) => count > 0)
                  .map(([status, count]) => (
                    <li key={status} className="flex justify-between">
                      <span>{t(`admin.tenants.status.${status}`)}</span>
                      <span className="font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("admin.dashboard.subscriptionsByStatus")}
              </h2>
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {Object.entries(data.subscriptions.byStatus)
                  .filter(([, count]) => count > 0)
                  .map(([status, count]) => (
                    <li key={status} className="flex justify-between">
                      <span>{t(`admin.subscriptions.status.${status}`)}</span>
                      <span className="font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
