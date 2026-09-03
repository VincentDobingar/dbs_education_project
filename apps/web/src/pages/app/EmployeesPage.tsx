import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { createEmployee, listEmployees } from "../../lib/employeesApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const employeeSchema = z.object({
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  jobTitle: z.string().min(1),
});

export function EmployeesPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const employees = useQuery({
    queryKey: ["employees", session.subdomain],
    queryFn: () => listEmployees(creds),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof employeeSchema>>({ resolver: zodResolver(employeeSchema) });

  const createMutation = useMutation({
    mutationFn: (input: z.infer<typeof employeeSchema>) => createEmployee(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employees", session.subdomain] });
      reset();
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("employees.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("employees.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employees.add")}</h2>
        <form
          onSubmit={(event) => void handleSubmit((values) => createMutation.mutate(values))(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
          noValidate
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("employees.number")}</label>
            <input className="input mt-1 w-32" {...register("employeeNumber")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("employees.firstName")}</label>
            <input className="input mt-1 w-36" {...register("firstName")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("employees.lastName")}</label>
            <input className="input mt-1 w-36" {...register("lastName")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("employees.jobTitle")}</label>
            <input className="input mt-1 w-40" {...register("jobTitle")} />
          </div>
          <Button type="submit" variant="secondary">
            {t("employees.add")}
          </Button>
        </form>
        {errors.employeeNumber || errors.firstName || errors.lastName || errors.jobTitle ? (
          <p className="mt-2 text-sm text-red-600">{t("employees.error.required")}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {employees.isPending ? <p className="text-sm text-slate-500">{t("students.loading")}</p> : null}
        {employees.data && employees.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t("employees.empty")}</p>
        ) : null}
        {employees.data && employees.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("employees.number")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("employees.firstName")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("employees.lastName")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("employees.jobTitle")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("employees.status")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.data.map((employee) => (
                  <tr key={employee.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{employee.employeeNumber}</td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/personnel/${employee.id}`}
                        className="font-medium text-teal-600 hover:underline"
                      >
                        {employee.firstName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{employee.lastName}</td>
                    <td className="py-2 pr-4 text-slate-700">{employee.jobTitle}</td>
                    <td className="py-2 pr-4 text-slate-700">{employee.status}</td>
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
