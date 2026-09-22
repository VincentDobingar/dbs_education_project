import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  assignLicense,
  createLicenseBatch,
  createOrganization,
  listLicenseBatches,
  listLicenses,
  listOrganizations,
  revokeLicense,
  type BillingPeriod,
  type LicenseBeneficiaryType,
  type LicensePurchaserType,
  type LicenseStatus,
  type OrganizationType,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const ORG_TYPES: OrganizationType[] = ["NGO", "COMPANY", "GOVERNMENT", "OTHER"];
const LICENSE_STATUSES: LicenseStatus[] = ["AVAILABLE", "ASSIGNED", "REVOKED", "EXPIRED"];
const BILLING_PERIODS: BillingPeriod[] = ["MONTHLY", "QUARTERLY", "ANNUAL"];

type Tab = "organizations" | "batches" | "licenses";

export function AdminSponsorsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("organizations");

  // --- Organisations ---
  const organizations = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: () => listOrganizations({}, creds),
  });
  const [orgForm, setOrgForm] = useState<{ name: string; type: OrganizationType }>({
    name: "",
    type: "NGO",
  });
  const createOrgMutation = useMutation({
    mutationFn: () => createOrganization(orgForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      setOrgForm({ name: "", type: "NGO" });
    },
  });

  // --- Lots de licences ---
  const batches = useQuery({
    queryKey: ["admin-license-batches"],
    queryFn: () => listLicenseBatches({}, creds),
  });
  const [batchForm, setBatchForm] = useState<{
    planId: string;
    purchaserType: LicensePurchaserType;
    sponsorOrganizationId: string;
    sponsorTenantId: string;
    quantity: string;
    unitPriceCents: string;
    currencyId: string;
  }>({
    planId: "",
    purchaserType: "ORGANIZATION",
    sponsorOrganizationId: "",
    sponsorTenantId: "",
    quantity: "",
    unitPriceCents: "",
    currencyId: "",
  });
  const createBatchMutation = useMutation({
    mutationFn: () =>
      createLicenseBatch(
        {
          planId: batchForm.planId,
          purchaserType: batchForm.purchaserType,
          ...(batchForm.purchaserType === "ORGANIZATION"
            ? { sponsorOrganizationId: batchForm.sponsorOrganizationId }
            : { sponsorTenantId: batchForm.sponsorTenantId }),
          quantity: Number(batchForm.quantity),
          unitPriceCents: Number(batchForm.unitPriceCents),
          currencyId: batchForm.currencyId,
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-license-batches"] });
      setBatchForm({
        planId: "",
        purchaserType: "ORGANIZATION",
        sponsorOrganizationId: "",
        sponsorTenantId: "",
        quantity: "",
        unitPriceCents: "",
        currencyId: "",
      });
    },
  });

  // --- Licences ---
  const [licenseStatusFilter, setLicenseStatusFilter] = useState<LicenseStatus | "">("");
  const licenses = useQuery({
    queryKey: ["admin-licenses", licenseStatusFilter],
    queryFn: () => listLicenses({ ...(licenseStatusFilter ? { status: licenseStatusFilter } : {}) }, creds),
  });
  const [assignTargetId, setAssignTargetId] = useState("");
  const [assignForm, setAssignForm] = useState<{
    beneficiaryType: LicenseBeneficiaryType;
    beneficiaryUserId: string;
    beneficiaryStudentId: string;
    tenantId: string;
    billingPeriod: BillingPeriod;
  }>({
    beneficiaryType: "PARENT",
    beneficiaryUserId: "",
    beneficiaryStudentId: "",
    tenantId: "",
    billingPeriod: "MONTHLY",
  });
  const assignMutation = useMutation({
    mutationFn: () =>
      assignLicense(
        assignTargetId,
        {
          beneficiaryType: assignForm.beneficiaryType,
          ...(assignForm.beneficiaryType === "PARENT"
            ? { beneficiaryUserId: assignForm.beneficiaryUserId }
            : { beneficiaryStudentId: assignForm.beneficiaryStudentId, tenantId: assignForm.tenantId }),
          billingPeriod: assignForm.billingPeriod,
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-licenses"] });
      setAssignTargetId("");
    },
  });
  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => revokeLicense(id, reason, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-licenses"] }),
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "organizations", label: t("admin.sponsors.tab.organizations") },
    { key: "batches", label: t("admin.sponsors.tab.batches") },
    { key: "licenses", label: t("admin.sponsors.tab.licenses") },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.sponsors.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.sponsors.subtitle")}</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === entry.key ? "border-b-2 border-brand-teal text-brand-teal" : "text-slate-500"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "organizations" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {(organizations.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.orgName")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.orgType")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.orgId")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(organizations.data ?? []).map((org) => (
                    <tr key={org.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-slate-700">{org.name}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {t(`admin.sponsors.orgTypeValue.${org.type}`)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">{org.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createOrgMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("admin.sponsors.orgName")}
              className="input w-64"
              value={orgForm.name}
              onChange={(event) => setOrgForm({ ...orgForm, name: event.target.value })}
            />
            <select
              className="input w-48"
              value={orgForm.type}
              onChange={(event) => setOrgForm({ ...orgForm, type: event.target.value as OrganizationType })}
            >
              {ORG_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`admin.sponsors.orgTypeValue.${type}`)}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" disabled={!orgForm.name || createOrgMutation.isPending}>
              {t("admin.common.create")}
            </Button>
          </form>
        </section>
      ) : null}

      {tab === "batches" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {(batches.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.batchId")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.quantity")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.unitPrice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(batches.data ?? []).map((batch) => (
                    <tr key={batch.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">{batch.id}</td>
                      <td className="py-2 pr-4 text-slate-700">{batch.quantity}</td>
                      <td className="py-2 pr-4 text-slate-700">{(batch.unitPriceCents / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createBatchMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("admin.sponsors.planId")}
              className="input w-40"
              value={batchForm.planId}
              onChange={(event) => setBatchForm({ ...batchForm, planId: event.target.value })}
            />
            <select
              className="input w-40"
              value={batchForm.purchaserType}
              onChange={(event) =>
                setBatchForm({ ...batchForm, purchaserType: event.target.value as LicensePurchaserType })
              }
            >
              <option value="ORGANIZATION">{t("admin.sponsors.purchaserType.ORGANIZATION")}</option>
              <option value="TENANT">{t("admin.sponsors.purchaserType.TENANT")}</option>
            </select>
            {batchForm.purchaserType === "ORGANIZATION" ? (
              <input
                placeholder={t("admin.sponsors.orgId")}
                className="input w-56"
                value={batchForm.sponsorOrganizationId}
                onChange={(event) =>
                  setBatchForm({ ...batchForm, sponsorOrganizationId: event.target.value })
                }
              />
            ) : (
              <input
                placeholder={t("admin.sponsors.tenantId")}
                className="input w-56"
                value={batchForm.sponsorTenantId}
                onChange={(event) => setBatchForm({ ...batchForm, sponsorTenantId: event.target.value })}
              />
            )}
            <input
              type="number"
              placeholder={t("admin.sponsors.quantity")}
              className="input w-28"
              value={batchForm.quantity}
              onChange={(event) => setBatchForm({ ...batchForm, quantity: event.target.value })}
            />
            <input
              type="number"
              placeholder={t("admin.sponsors.unitPriceCents")}
              className="input w-32"
              value={batchForm.unitPriceCents}
              onChange={(event) => setBatchForm({ ...batchForm, unitPriceCents: event.target.value })}
            />
            <input
              placeholder={t("admin.sponsors.currencyId")}
              className="input w-40"
              value={batchForm.currencyId}
              onChange={(event) => setBatchForm({ ...batchForm, currencyId: event.target.value })}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={
                !batchForm.planId || !batchForm.quantity || !batchForm.unitPriceCents || !batchForm.currencyId
              }
            >
              {t("admin.common.create")}
            </Button>
          </form>
        </section>
      ) : null}

      {tab === "licenses" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <select
            className="input w-56"
            value={licenseStatusFilter}
            onChange={(event) => setLicenseStatusFilter(event.target.value as LicenseStatus | "")}
          >
            <option value="">{t("admin.common.allStatuses")}</option>
            {LICENSE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`admin.sponsors.licenseStatus.${status}`)}
              </option>
            ))}
          </select>

          {(licenses.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t("admin.common.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pr-4 font-medium">{t("admin.sponsors.licenseId")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                    <th className="pb-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {(licenses.data ?? []).map((license) => (
                    <tr key={license.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">{license.id}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {t(`admin.sponsors.licenseStatus.${license.status}`)}
                      </td>
                      <td className="py-2 pr-4">
                        {license.status === "AVAILABLE" ? (
                          <button
                            type="button"
                            className="text-xs text-brand-teal hover:underline"
                            onClick={() => setAssignTargetId(license.id)}
                          >
                            {t("admin.sponsors.assign")}
                          </button>
                        ) : null}
                        {license.status === "ASSIGNED" ? (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => revokeMutation.mutate({ id: license.id, reason: "" })}
                          >
                            {t("admin.sponsors.revoke")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {assignTargetId ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                assignMutation.mutate();
              }}
              className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
            >
              <select
                className="input w-40"
                value={assignForm.beneficiaryType}
                onChange={(event) =>
                  setAssignForm({
                    ...assignForm,
                    beneficiaryType: event.target.value as LicenseBeneficiaryType,
                  })
                }
              >
                <option value="PARENT">{t("admin.sponsors.beneficiaryType.PARENT")}</option>
                <option value="STUDENT">{t("admin.sponsors.beneficiaryType.STUDENT")}</option>
              </select>
              {assignForm.beneficiaryType === "PARENT" ? (
                <input
                  placeholder={t("admin.sponsors.beneficiaryUserId")}
                  className="input w-56"
                  value={assignForm.beneficiaryUserId}
                  onChange={(event) =>
                    setAssignForm({ ...assignForm, beneficiaryUserId: event.target.value })
                  }
                />
              ) : (
                <>
                  <input
                    placeholder={t("admin.sponsors.beneficiaryStudentId")}
                    className="input w-56"
                    value={assignForm.beneficiaryStudentId}
                    onChange={(event) =>
                      setAssignForm({ ...assignForm, beneficiaryStudentId: event.target.value })
                    }
                  />
                  <input
                    placeholder={t("admin.sponsors.tenantId")}
                    className="input w-56"
                    value={assignForm.tenantId}
                    onChange={(event) => setAssignForm({ ...assignForm, tenantId: event.target.value })}
                  />
                </>
              )}
              <select
                className="input w-40"
                value={assignForm.billingPeriod}
                onChange={(event) =>
                  setAssignForm({ ...assignForm, billingPeriod: event.target.value as BillingPeriod })
                }
              >
                {BILLING_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary" disabled={assignMutation.isPending}>
                {t("admin.sponsors.confirmAssign")}
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
