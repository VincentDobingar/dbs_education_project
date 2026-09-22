import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  elevateInTenant,
  getPlatformTenant,
  listPlatformTenants,
  listTenantElevations,
  MAX_ELEVATION_HOURS,
  reactivateTenant,
  rejectTenant,
  revokeElevation,
  suspendTenant,
  verifyTenant,
  type TenantStatus,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const STATUSES: TenantStatus[] = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "REJECTED",
  "CANCELLED",
];

export function AdminTenantsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<TenantStatus | "">("");
  const [search, setSearch] = useState("");
  const tenants = useQuery({
    queryKey: ["admin-tenants", statusFilter, search],
    queryFn: () =>
      listPlatformTenants(
        { ...(statusFilter ? { status: statusFilter } : {}), ...(search ? { search } : {}) },
        creds,
      ),
  });

  const [selectedId, setSelectedId] = useState("");
  const selected = useQuery({
    queryKey: ["admin-tenant", selectedId],
    queryFn: () => getPlatformTenant(selectedId, creds),
    enabled: Boolean(selectedId),
  });
  const elevations = useQuery({
    queryKey: ["admin-tenant-elevations", selectedId],
    queryFn: () => listTenantElevations(selectedId, creds),
    enabled: Boolean(selectedId),
  });

  const [justification, setJustification] = useState("");

  function invalidateAfterAction(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-tenant", selectedId] });
    setJustification("");
  }

  const verifyMutation = useMutation({
    mutationFn: () => verifyTenant(selectedId, justification, creds),
    onSuccess: invalidateAfterAction,
  });
  const rejectMutation = useMutation({
    mutationFn: () => rejectTenant(selectedId, justification, creds),
    onSuccess: invalidateAfterAction,
  });
  const suspendMutation = useMutation({
    mutationFn: () => suspendTenant(selectedId, justification, creds),
    onSuccess: invalidateAfterAction,
  });
  const reactivateMutation = useMutation({
    mutationFn: () => reactivateTenant(selectedId, justification, creds),
    onSuccess: invalidateAfterAction,
  });

  const [roleCode, setRoleCode] = useState("SCHOOL_OWNER");
  const [durationHours, setDurationHours] = useState(24);
  const elevateMutation = useMutation({
    mutationFn: () => elevateInTenant(selectedId, { roleCode, durationHours, justification }, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-tenant-elevations", selectedId] });
      setJustification("");
    },
  });
  const revokeElevationMutation = useMutation({
    mutationFn: (userRoleId: string) => revokeElevation(selectedId, userRoleId, justification, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-tenant-elevations", selectedId] });
    },
  });

  const canAct = justification.trim().length > 0;
  const anyMutating =
    verifyMutation.isPending ||
    rejectMutation.isPending ||
    suspendMutation.isPending ||
    reactivateMutation.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.tenants.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.tenants.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <input
            placeholder={t("admin.tenants.searchPlaceholder")}
            className="input w-64"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input w-56"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TenantStatus | "")}
          >
            <option value="">{t("admin.common.allStatuses")}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`admin.tenants.status.${status}`)}
              </option>
            ))}
          </select>
        </div>

        {(tenants.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("admin.tenants.name")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.tenants.createdAt")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(tenants.data ?? []).map((tenant) => (
                  <tr key={tenant.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{tenant.name}</td>
                    <td className="py-2 pr-4 text-slate-700">{t(`admin.tenants.status.${tenant.status}`)}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() => {
                          setSelectedId(tenant.id);
                          setJustification("");
                        }}
                      >
                        {t("admin.common.open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected.data ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{selected.data.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t(`admin.tenants.status.${selected.data.status}`)}
            {selected.data.legalName ? ` · ${selected.data.legalName}` : ""}
          </p>
          {selected.data.suspendedReason ? (
            <p className="mt-1 text-sm text-red-600">{selected.data.suspendedReason}</p>
          ) : null}

          <label className="mt-4 block text-sm font-medium text-slate-700">
            {t("admin.common.justification")}
            <input
              className="input mt-1 w-full"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder={t("admin.common.justificationPlaceholder")}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {selected.data.status === "PENDING_VERIFICATION" ? (
              <>
                <Button
                  variant="secondary"
                  disabled={!canAct || anyMutating}
                  onClick={() => verifyMutation.mutate()}
                >
                  {t("admin.tenants.action.verify")}
                </Button>
                <Button
                  variant="primary"
                  disabled={!canAct || anyMutating}
                  onClick={() => rejectMutation.mutate()}
                >
                  {t("admin.tenants.action.reject")}
                </Button>
              </>
            ) : null}
            {["VERIFIED", "TRIAL", "ACTIVE"].includes(selected.data.status) ? (
              <Button
                variant="primary"
                disabled={!canAct || anyMutating}
                onClick={() => suspendMutation.mutate()}
              >
                {t("admin.tenants.action.suspend")}
              </Button>
            ) : null}
            {selected.data.status === "SUSPENDED" ? (
              <Button
                variant="secondary"
                disabled={!canAct || anyMutating}
                onClick={() => reactivateMutation.mutate()}
              >
                {t("admin.tenants.action.reactivate")}
              </Button>
            ) : null}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">{t("admin.tenants.elevations.title")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("admin.tenants.elevations.subtitle")}</p>

            {(elevations.data ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t("admin.common.empty")}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {(elevations.data ?? []).map((elevation) => {
                  const active = elevation.expiresAt !== null && new Date(elevation.expiresAt) > new Date();
                  return (
                    <li
                      key={elevation.id}
                      className="flex items-center justify-between border-b border-slate-100 pb-2"
                    >
                      <span className="text-slate-700">
                        {elevation.userId} ·{" "}
                        {elevation.expiresAt
                          ? new Date(elevation.expiresAt).toLocaleString()
                          : t("admin.common.never")}
                      </span>
                      {active ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          disabled={!canAct || revokeElevationMutation.isPending}
                          onClick={() => revokeElevationMutation.mutate(elevation.id)}
                        >
                          {t("admin.tenants.elevations.revoke")}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {t("admin.tenants.elevations.expired")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium text-slate-700">
                {t("admin.tenants.elevations.roleCode")}
                <input
                  className="input mt-1 w-40"
                  value={roleCode}
                  onChange={(event) => setRoleCode(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                {t("admin.tenants.elevations.durationHours")}
                <input
                  type="number"
                  min={1}
                  max={MAX_ELEVATION_HOURS}
                  className="input mt-1 w-24"
                  value={durationHours}
                  onChange={(event) => setDurationHours(Number(event.target.value))}
                />
              </label>
              <Button
                variant="secondary"
                disabled={!canAct || elevateMutation.isPending}
                onClick={() => elevateMutation.mutate()}
              >
                {t("admin.tenants.elevations.grant")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
