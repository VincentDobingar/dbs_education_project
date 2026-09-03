import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import {
  archiveEmployee,
  getEmployee,
  updateEmployeeStatus,
  type EmployeeStatus,
} from "../../lib/employeesApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const STATUSES: EmployeeStatus[] = ["ACTIVE", "ON_LEAVE", "TERMINATED"];

export function EmployeeDetailPage(): ReactNode {
  const { t } = useTranslation("app");
  const { id } = useParams<{ id: string }>();
  const employeeId = id as string;
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const employee = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(employeeId, creds),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
    void queryClient.invalidateQueries({ queryKey: ["employees", session.subdomain] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: EmployeeStatus) => updateEmployeeStatus(employeeId, status, creds),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveEmployee(employeeId, creds),
    onSuccess: () => {
      // Archived employees 404 on GET /employees/:id (same "gone from normal reads"
      // convention as the rest of this codebase) — navigate away rather than
      // invalidating a detail query that would now fail and render as "not found".
      void queryClient.invalidateQueries({ queryKey: ["employees", session.subdomain] });
      void navigate("/personnel");
    },
  });

  if (employee.isPending) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-500">{t("students.loading")}</p>;
  }
  if (!employee.data) {
    return (
      <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-red-600">{t("employeeDetail.notFound")}</p>
    );
  }

  const isArchived = Boolean(employee.data.deletedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {employee.data.firstName} {employee.data.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("employees.number")} : {employee.data.employeeNumber} — {employee.data.jobTitle}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.status")}</h2>

        {isArchived ? (
          <p className="mt-3 text-sm text-amber-600">{t("employeeDetail.archived")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="input w-40"
              value={employee.data.status}
              onChange={(event) => statusMutation.mutate(event.target.value as EmployeeStatus)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <Button type="button" variant="primary" onClick={() => archiveMutation.mutate()}>
              {t("employeeDetail.archive")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
