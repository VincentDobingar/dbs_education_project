import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { listAuditLogs } from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

export function AdminAuditLogsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };

  const [tenantId, setTenantId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorUserId, setActorUserId] = useState("");

  const logs = useQuery({
    queryKey: ["admin-audit-logs", tenantId, entityType, actorUserId],
    queryFn: () =>
      listAuditLogs(
        {
          ...(tenantId ? { tenantId } : {}),
          ...(entityType ? { entityType } : {}),
          ...(actorUserId ? { actorUserId } : {}),
        },
        creds,
      ),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.auditLogs.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.auditLogs.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <input
            placeholder={t("admin.auditLogs.filterTenantId")}
            className="input w-56"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
          />
          <input
            placeholder={t("admin.auditLogs.filterEntityType")}
            className="input w-48"
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          />
          <input
            placeholder={t("admin.auditLogs.filterActorUserId")}
            className="input w-56"
            value={actorUserId}
            onChange={(event) => setActorUserId(event.target.value)}
          />
        </div>

        {(logs.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("admin.auditLogs.when")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.auditLogs.action")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.auditLogs.entity")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.auditLogs.actor")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.auditLogs.justification")}</th>
                </tr>
              </thead>
              <tbody>
                {(logs.data ?? []).map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-700">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{entry.action}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {entry.entityType} · {entry.entityId}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {entry.actorUserId ?? "—"}
                      {entry.actorRoleCode ? ` (${entry.actorRoleCode})` : ""}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{entry.justification ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
