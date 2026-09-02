import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { createStudent, listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const studentSchema = z.object({
  matricule: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export function StudentsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const students = useQuery({
    queryKey: ["students", session.subdomain],
    queryFn: () => listStudents(creds),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof studentSchema>>({ resolver: zodResolver(studentSchema) });

  const createMutation = useMutation({
    mutationFn: (input: z.infer<typeof studentSchema>) => createStudent(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["students", session.subdomain] });
      reset();
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("students.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("students.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("students.add")}</h2>
        <form
          onSubmit={(event) => void handleSubmit((values) => createMutation.mutate(values))(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
          noValidate
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("students.matricule")}</label>
            <input className="input mt-1 w-32" {...register("matricule")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("students.firstName")}</label>
            <input className="input mt-1 w-40" {...register("firstName")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("students.lastName")}</label>
            <input className="input mt-1 w-40" {...register("lastName")} />
          </div>
          <Button type="submit" variant="secondary">
            {t("students.add")}
          </Button>
        </form>
        {errors.matricule || errors.firstName || errors.lastName ? (
          <p className="mt-2 text-sm text-red-600">{t("students.error.required")}</p>
        ) : null}
        {createMutation.data?.possibleDuplicates && createMutation.data.possibleDuplicates.length > 0 ? (
          <p className="mt-2 text-sm text-amber-600">{t("students.possibleDuplicate")}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {students.isPending ? <p className="text-sm text-slate-500">{t("students.loading")}</p> : null}
        {students.data && students.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t("students.empty")}</p>
        ) : null}
        {students.data && students.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("students.matricule")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.firstName")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.lastName")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                </tr>
              </thead>
              <tbody>
                {students.data.map((student) => (
                  <tr key={student.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{student.matricule}</td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/eleves/${student.id}`}
                        className="font-medium text-teal-600 hover:underline"
                      >
                        {student.firstName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{student.lastName}</td>
                    <td className="py-2 pr-4 text-slate-700">{student.status}</td>
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
