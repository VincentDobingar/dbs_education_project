import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { ApiError } from "../../lib/apiClient.js";
import {
  TENANT_ROLES,
  grantRole,
  inviteTenantUser,
  listTenantUsers,
  revokeRole,
  updateMembershipStatus,
  type MembershipStatus,
} from "../../lib/tenantUsersApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const inviteSchema = z.object({
  email: z.string().email(),
  roleCode: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

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
      case "ROLE_EXCEEDS_GRANTER_PERMISSIONS":
        return t("users.error.roleExceedsPermissions");
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

export function UsersPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();
  const [rowError, setRowError] = useState<string | null>(null);
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({});

  const users = useQuery({
    queryKey: ["tenant-users", session.subdomain],
    queryFn: () => listTenantUsers(creds),
  });

  function invalidateUsers(): void {
    void queryClient.invalidateQueries({ queryKey: ["tenant-users", session.subdomain] });
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema) });

  const inviteMutation = useMutation({
    mutationFn: (input: z.infer<typeof inviteSchema>) => {
      const { firstName, lastName, ...rest } = input;
      return inviteTenantUser(
        { ...rest, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) },
        creds,
      );
    },
    onSuccess: () => {
      invalidateUsers();
      reset();
      setRowError(null);
    },
    onError: (error) => setRowError(errorMessageFor(error, t)),
  });

  const grantMutation = useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      grantRole(userId, roleCode, creds),
    onSuccess: () => {
      invalidateUsers();
      setRowError(null);
    },
    onError: (error) => setRowError(errorMessageFor(error, t)),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      revokeRole(userId, roleCode, creds),
    onSuccess: () => {
      invalidateUsers();
      setRowError(null);
    },
    onError: (error) => setRowError(errorMessageFor(error, t)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: MembershipStatus }) =>
      updateMembershipStatus(userId, status, creds),
    onSuccess: () => {
      invalidateUsers();
      setRowError(null);
    },
    onError: (error) => setRowError(errorMessageFor(error, t)),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("users.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("users.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("users.invite")}</h2>
        <form
          onSubmit={(event) => void handleSubmit((values) => inviteMutation.mutate(values))(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
          noValidate
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("users.email")}</label>
            <input type="email" className="input mt-1 w-56" {...register("email")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("users.firstName")}</label>
            <input className="input mt-1 w-36" {...register("firstName")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("users.lastName")}</label>
            <input className="input mt-1 w-36" {...register("lastName")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("users.role")}</label>
            <select className="input mt-1 w-48" {...register("roleCode")}>
              <option value="">{t("users.selectRole")}</option>
              {TENANT_ROLES.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.nameFr}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            {t("users.invite")}
          </Button>
        </form>
        {errors.email || errors.roleCode ? (
          <p className="mt-2 text-sm text-red-600">{t("users.error.formInvalid")}</p>
        ) : null}
        {rowError ? <p className="mt-2 text-sm text-red-600">{rowError}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {users.isPending ? <p className="text-sm text-slate-500">{t("students.loading")}</p> : null}
        {users.data && users.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("users.email")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("users.name")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("users.status")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("users.roles")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("users.grantRole")}</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((user) => (
                  <tr key={user.userId} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{user.email}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        className="input w-32 py-1"
                        value={user.membershipStatus}
                        onChange={(event) =>
                          statusMutation.mutate({
                            userId: user.userId,
                            status: event.target.value as MembershipStatus,
                          })
                        }
                      >
                        {MEMBERSHIP_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
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
                              onClick={() => revokeMutation.mutate({ userId: user.userId, roleCode: code })}
                              className="text-slate-400 hover:text-red-600"
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
                          disabled={!roleSelections[user.userId]}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
