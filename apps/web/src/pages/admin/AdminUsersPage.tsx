import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/apiClient.js";
import {
  grantPlatformTenantRole,
  invitePlatformTenantUser,
  listPlatformTenants,
  listPlatformTenantUsers,
  revokePlatformTenantRole,
  sendPlatformTenantUserAccessEmail,
  updatePlatformTenantMembershipStatus,
  type MembershipStatus,
} from "../../lib/platformAdminApi.js";
import { TENANT_ROLES } from "../../lib/tenantUsersApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const MEMBERSHIP_STATUSES: MembershipStatus[] = ["ACTIVE", "SUSPENDED", "REVOKED"];

function roleName(code: string): string {
  return TENANT_ROLES.find((role) => role.code === code)?.nameFr ?? code;
}

function errorMessageFor(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "ALREADY_MEMBER":
        return t("users.error.alreadyMember");
      case "ROLE_NOT_FOUND":
        return t("users.error.roleNotFound");
      case "NAME_REQUIRED":
        return t("users.error.nameRequired");
      case "ROLE_ALREADY_GRANTED":
        return t("users.error.roleAlreadyGranted");
      case "ROLE_NOT_GRANTED":
        return t("users.error.roleNotGranted");
      default:
        return t("users.error.generic");
    }
  }
  return t("users.error.generic");
}

interface InviteForm {
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  sendAccessEmail: boolean;
}

const EMPTY_FORM: InviteForm = {
  email: "",
  firstName: "",
  lastName: "",
  roleCode: "",
  sendAccessEmail: true,
};

/**
 * Comptes des établissements : ajout d'une personne avec un rôle, rôles, statut et
 * renvoi du lien d'accès. Géré uniquement ici — l'espace établissement n'a plus de
 * menu « Utilisateurs ».
 */
export function AdminUsersPage(): ReactNode {
  const { t, i18n } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();
  const locale = i18n.language.startsWith("en") ? "en" : "fr";

  const tenants = useQuery({
    queryKey: ["admin-tenants", "", ""],
    queryFn: () => listPlatformTenants({}, creds),
  });
  const [tenantId, setTenantId] = useState("");
  const selectedTenant = (tenants.data ?? []).find((tenant) => tenant.id === tenantId);

  const users = useQuery({
    queryKey: ["admin-tenant-users", tenantId],
    queryFn: () => listPlatformTenantUsers(tenantId, creds),
    enabled: Boolean(tenantId),
  });

  const [justification, setJustification] = useState(t("admin.users.defaultJustification"));
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function onSuccess(text: string): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-tenant-users", tenantId] });
    setMessage({ kind: "ok", text });
  }
  function onError(error: unknown): void {
    setMessage({ kind: "error", text: errorMessageFor(error, t) });
  }

  const inviteMutation = useMutation({
    mutationFn: () =>
      invitePlatformTenantUser(
        tenantId,
        {
          email: form.email.trim(),
          roleCode: form.roleCode,
          ...(form.firstName.trim() ? { firstName: form.firstName.trim() } : {}),
          ...(form.lastName.trim() ? { lastName: form.lastName.trim() } : {}),
          sendAccessEmail: form.sendAccessEmail,
          locale,
          justification,
        },
        creds,
      ),
    onSuccess: () => {
      onSuccess(form.sendAccessEmail ? t("admin.users.invitedWithEmail") : t("admin.users.invited"));
      setForm(EMPTY_FORM);
    },
    onError,
  });
  const grantMutation = useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      grantPlatformTenantRole(tenantId, userId, roleCode, justification, creds),
    onSuccess: () => onSuccess(t("admin.users.saved")),
    onError,
  });
  const revokeMutation = useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      revokePlatformTenantRole(tenantId, userId, roleCode, justification, creds),
    onSuccess: () => onSuccess(t("admin.users.saved")),
    onError,
  });
  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: MembershipStatus }) =>
      updatePlatformTenantMembershipStatus(tenantId, userId, status, justification, creds),
    onSuccess: () => onSuccess(t("admin.users.saved")),
    onError,
  });
  const accessEmailMutation = useMutation({
    mutationFn: (userId: string) =>
      sendPlatformTenantUserAccessEmail(tenantId, userId, locale, justification, creds),
    onSuccess: () => onSuccess(t("admin.users.accessEmailSent")),
    onError,
  });

  const canAct = Boolean(tenantId) && justification.trim().length > 0;

  function submitInvite(event: FormEvent): void {
    event.preventDefault();
    if (!form.email.trim() || !form.roleCode) {
      setMessage({ kind: "error", text: t("users.error.formInvalid") });
      return;
    }
    inviteMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.users.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.users.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            {t("admin.users.tenant")}
            <select
              className="input mt-1 w-full"
              value={tenantId}
              onChange={(event) => {
                setTenantId(event.target.value);
                setMessage(null);
              }}
            >
              <option value="">{t("admin.users.selectTenant")}</option>
              {(tenants.data ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} — {t(`admin.tenants.status.${tenant.status}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t("admin.common.justification")}
            <input
              className="input mt-1 w-full"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder={t("admin.common.justificationPlaceholder")}
            />
          </label>
        </div>
        {message ? (
          <p
            role="status"
            className={`mt-3 text-sm ${message.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      {selectedTenant ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.users.addTitle", { tenant: selectedTenant.name })}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t("admin.users.addHelp")}</p>
            <form onSubmit={submitInvite} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
              <label className="block text-xs font-medium text-slate-600">
                {t("users.email")}
                <input
                  type="email"
                  className="input mt-1 w-60"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                {t("users.firstName")}
                <input
                  className="input mt-1 w-36"
                  value={form.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                {t("users.lastName")}
                <input
                  className="input mt-1 w-36"
                  value={form.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                {t("users.role")}
                <select
                  className="input mt-1 w-52"
                  value={form.roleCode}
                  onChange={(event) => setForm({ ...form, roleCode: event.target.value })}
                >
                  <option value="">{t("users.selectRole")}</option>
                  {TENANT_ROLES.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.nameFr}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={form.sendAccessEmail}
                  onChange={(event) => setForm({ ...form, sendAccessEmail: event.target.checked })}
                />
                {t("admin.users.sendAccessEmail")}
              </label>
              <Button type="submit" variant="secondary" disabled={!canAct || inviteMutation.isPending}>
                {t("admin.users.add")}
              </Button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            {users.isPending ? <p className="text-sm text-slate-500">{t("admin.common.loading")}</p> : null}
            {users.isError ? <p className="text-sm text-red-600">{t("list.error.loadFailed")}</p> : null}
            {users.data && users.data.length === 0 ? (
              <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
            ) : null}
            {users.data && users.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 pr-4 font-medium">{t("users.name")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("users.status")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("users.roles")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("users.grantRole")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("admin.users.access")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.map((user) => (
                      <tr key={user.userId} className="border-b border-slate-100 align-top last:border-0">
                        <td className="py-2 pr-4">
                          <p className="font-medium text-slate-800">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                          <p className="text-xs text-slate-400">
                            {user.lastLoginAt
                              ? t("admin.users.lastLogin", {
                                  date: new Date(user.lastLoginAt).toLocaleDateString(),
                                })
                              : t("admin.users.neverLoggedIn")}
                          </p>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="input w-32 py-1"
                            value={user.membershipStatus}
                            disabled={!canAct}
                            aria-label={t("users.status")}
                            onChange={(event) =>
                              statusMutation.mutate({
                                userId: user.userId,
                                status: event.target.value as MembershipStatus,
                              })
                            }
                          >
                            {MEMBERSHIP_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {t(`admin.users.membership.${status}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {user.roleCodes.map((code) => (
                              <span
                                key={code}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                              >
                                {roleName(code)}
                                <button
                                  type="button"
                                  disabled={!canAct}
                                  onClick={() =>
                                    revokeMutation.mutate({ userId: user.userId, roleCode: code })
                                  }
                                  className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                                  aria-label={t("users.revokeRole")}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <select
                              className="input w-40 py-1"
                              aria-label={t("users.grantRole")}
                              value={roleSelections[user.userId] ?? ""}
                              onChange={(event) =>
                                setRoleSelections((current) => ({
                                  ...current,
                                  [user.userId]: event.target.value,
                                }))
                              }
                            >
                              <option value="">{t("users.selectRole")}</option>
                              {TENANT_ROLES.map((role) => (
                                <option key={role.code} value={role.code}>
                                  {role.nameFr}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              variant="primary"
                              disabled={!canAct || !roleSelections[user.userId]}
                              onClick={() => {
                                const roleCode = roleSelections[user.userId];
                                if (roleCode) {
                                  grantMutation.mutate({ userId: user.userId, roleCode });
                                }
                              }}
                            >
                              {t("users.grant")}
                            </Button>
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            className="text-xs text-brand-teal hover:underline disabled:opacity-40"
                            disabled={!canAct || accessEmailMutation.isPending}
                            onClick={() => accessEmailMutation.mutate(user.userId)}
                          >
                            {t("admin.users.resendAccess")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
