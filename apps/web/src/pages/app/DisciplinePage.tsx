import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { ApiError } from "../../lib/apiClient.js";
import { createIncident, listIncidents, removeIncident } from "../../lib/disciplineApi.js";
import { listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const SEVERITIES = ["MINOR", "MODERATE", "SEVERE"] as const;

const incidentSchema = z.object({
  studentId: z.string().min(1),
  occurredAt: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(SEVERITIES),
  sanction: z.string().optional(),
  correctiveAction: z.string().optional(),
});

function severityClassName(severity: string): string {
  if (severity === "SEVERE") return "bg-red-100 text-red-700";
  if (severity === "MODERATE") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export function DisciplinePage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const students = useQuery({
    queryKey: ["students", session.subdomain],
    queryFn: () => listStudents(creds),
  });
  const incidents = useQuery({
    queryKey: ["discipline-incidents", session.subdomain],
    queryFn: () => listIncidents(creds),
  });

  function studentName(studentId: string): string {
    const student = students.data?.find((candidate) => candidate.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : studentId;
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof incidentSchema>>({ resolver: zodResolver(incidentSchema) });

  const createMutation = useMutation({
    mutationFn: (input: z.infer<typeof incidentSchema>) => {
      const { sanction, correctiveAction, ...rest } = input;
      return createIncident(
        {
          ...rest,
          ...(sanction ? { sanction } : {}),
          ...(correctiveAction ? { correctiveAction } : {}),
        },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["discipline-incidents", session.subdomain] });
      reset();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeIncident(id, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["discipline-incidents", session.subdomain] });
    },
  });

  const createError =
    createMutation.error instanceof ApiError && createMutation.error.code === "EMPLOYEE_RECORD_REQUIRED"
      ? t("discipline.error.employeeRecordRequired")
      : createMutation.isError
        ? t("discipline.error.generic")
        : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("discipline.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("discipline.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("discipline.report")}</h2>
        <form
          onSubmit={(event) => void handleSubmit((values) => createMutation.mutate(values))(event)}
          className="mt-4 space-y-3"
          noValidate
        >
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">{t("discipline.student")}</label>
              <select className="input mt-1 w-56" {...register("studentId")}>
                <option value="">{t("discipline.selectStudent")}</option>
                {(students.data ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">{t("discipline.date")}</label>
              <input type="date" className="input mt-1 w-40" {...register("occurredAt")} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">{t("discipline.severity")}</label>
              <select className="input mt-1 w-36" {...register("severity")}>
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {t(`discipline.severity.${severity}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">{t("discipline.description")}</label>
            <textarea className="input mt-1 w-full" rows={2} {...register("description")} />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600">{t("discipline.sanction")}</label>
              <input className="input mt-1 w-full" {...register("sanction")} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600">
                {t("discipline.correctiveAction")}
              </label>
              <input className="input mt-1 w-full" {...register("correctiveAction")} />
            </div>
          </div>

          <Button type="submit" variant="secondary">
            {t("discipline.report")}
          </Button>
        </form>
        {errors.studentId || errors.occurredAt || errors.description ? (
          <p className="mt-2 text-sm text-red-600">{t("discipline.error.required")}</p>
        ) : null}
        {createError ? <p className="mt-2 text-sm text-red-600">{createError}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {incidents.isPending ? <p className="text-sm text-slate-500">{t("students.loading")}</p> : null}
        {incidents.data && incidents.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t("discipline.empty")}</p>
        ) : null}
        {incidents.data && incidents.data.length > 0 ? (
          <ul className="space-y-3">
            {incidents.data.map((incident) => (
              <li key={incident.id} className="rounded-md border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {studentName(incident.studentId)}
                      <span className="ml-2 text-xs text-slate-400">{incident.occurredAt.slice(0, 10)}</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{incident.description}</p>
                    {incident.sanction ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {t("discipline.sanction")} : {incident.sanction}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${severityClassName(incident.severity)}`}
                    >
                      {t(`discipline.severity.${incident.severity}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMutation.mutate(incident.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      {t("discipline.remove")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
