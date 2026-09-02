import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getDirectionDashboard } from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";
import { loadSession } from "../../lib/session.js";

function StatCard({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function DashboardPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadSession();

  const { data, isPending, error } = useQuery({
    queryKey: ["direction-dashboard", session?.subdomain],
    queryFn: () => getDirectionDashboard(session?.accessToken as string, session?.subdomain as string),
    enabled: Boolean(session),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">{t("dashboard.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("dashboard.subtitle")}</p>

      {isPending ? <p className="mt-8 text-sm text-slate-500">{t("dashboard.loading")}</p> : null}

      {error ? (
        <p className="mt-8 text-sm text-red-600">
          {error instanceof ApiError && error.status === 403
            ? t("dashboard.error.forbidden")
            : error instanceof ApiError && error.status === 402
              ? t("dashboard.error.noSubscription")
              : t("dashboard.error.generic")}
        </p>
      ) : null}

      {data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("dashboard.stat.students")} value={String(data.students.total)} />
          <StatCard label={t("dashboard.stat.staff")} value={String(data.staff.total)} />
          <StatCard
            label={t("dashboard.stat.attendance")}
            value={
              data.attendance.presenceRate !== null
                ? `${Math.round(data.attendance.presenceRate * 100)}%`
                : "—"
            }
          />
          <StatCard
            label={t("dashboard.stat.outstanding")}
            value={formatAmount(data.finance.outstandingCents)}
          />
          <StatCard
            label={t("dashboard.stat.recentEnrollments")}
            value={String(data.students.recentEnrollments)}
          />
          <StatCard label={t("dashboard.stat.reportCards")} value={String(data.academics.reportCardCount)} />
          <StatCard
            label={t("dashboard.stat.discipline")}
            value={String(data.discipline.recentIncidentCount)}
          />
          <StatCard
            label={t("dashboard.stat.revenue")}
            value={formatAmount(data.finance.recentRevenueCents)}
          />
        </div>
      ) : null}
    </div>
  );
}
