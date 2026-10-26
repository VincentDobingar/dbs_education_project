import { Button, Field, Table, Toast, type TableColumn } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { listGuardians } from "../../lib/registrationApi.js";
import {
  createStudent,
  fetchStudentsExportCsv,
  fetchStudentsExportXlsx,
  listStudentsPage,
  type Student,
} from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

import { ClassIdCardsDownload } from "./ClassIdCardsDownload.js";

const PAGE_SIZE = 50;

const studentSchema = z.object({
  primaryGuardianId: z.string().min(1),
  matricule: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export function StudentsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();
  const guardians = useQuery({
    queryKey: ["guardians", session.subdomain],
    queryFn: () => listGuardians(creds),
  });
  const [page, setPage] = useState(1);

  // Pagination réelle côté serveur (pas juste un tableau complet tronqué côté
  // client) — un gros établissement peut compter plusieurs milliers d'élèves.
  const students = useQuery({
    queryKey: ["students", session.subdomain, page],
    queryFn: () => listStudentsPage(creds, page, PAGE_SIZE),
  });
  const totalPages = students.data ? Math.max(1, Math.ceil(students.data.total / PAGE_SIZE)) : 1;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof studentSchema>>({ resolver: zodResolver(studentSchema) });

  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: z.infer<typeof studentSchema>) => createStudent(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["students", session.subdomain] });
      reset();
      setToast({ message: t("students.created"), variant: "success" });
    },
    onError: () => {
      setToast({ message: t("students.createError"), variant: "error" });
    },
  });

  const columns: TableColumn<Student>[] = [
    { key: "matricule", header: t("students.matricule"), render: (student) => student.matricule },
    {
      key: "firstName",
      header: t("students.firstName"),
      render: (student) => (
        <Link to={`/eleves/${student.id}`} className="font-medium text-teal-600 hover:underline">
          {student.firstName}
        </Link>
      ),
    },
    { key: "lastName", header: t("students.lastName"), render: (student) => student.lastName },
    { key: "status", header: t("students.status"), render: (student) => student.status },
    {
      key: "year",
      header: "Année académique",
      render: (student) => student.enrollments?.[0]?.academicYear.name ?? "Non inscrit",
    },
    {
      key: "classroom",
      header: "Classe",
      render: (student) => student.enrollments?.[0]?.classroom.name ?? "—",
    },
    {
      key: "guardian",
      header: "Tuteur principal",
      render: (student) => {
        const guardian =
          student.primaryGuardian ?? guardians.data?.find((g) => g.id === student.primaryGuardianId);
        return guardian ? (
          `${guardian.firstName} ${guardian.lastName}`
        ) : (
          <Link className="text-amber-700 underline" to={`/eleves/${student.id}`}>
            À compléter
          </Link>
        );
      },
    },
  ];

  async function downloadExport(fetcher: () => Promise<Blob>, filename: string): Promise<void> {
    const blob = await fetcher();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("students.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("students.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void downloadExport(() => fetchStudentsExportCsv(creds), "students.csv")}
          >
            {t("students.exportCsv")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void downloadExport(() => fetchStudentsExportXlsx(creds), "students.xlsx")}
          >
            {t("students.exportExcel")}
          </Button>
        </div>
      </div>

      <ClassIdCardsDownload key={session.subdomain} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("students.add")}</h2>

        <form
          onSubmit={(event) => void handleSubmit((values) => createMutation.mutate(values))(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
          noValidate
        >
          <Field label={t("students.matricule")}>
            <input className="input w-32" {...register("matricule")} />
          </Field>
          <Field label={t("students.firstName")}>
            <input className="input w-40" {...register("firstName")} />
          </Field>
          <Field label={t("students.lastName")}>
            <input className="input w-40" {...register("lastName")} />
          </Field>
          <Button type="submit" variant="secondary">
            {t("students.add")}
          </Button>
          <Field label="Parent / tuteur principal">
            <select className="input" {...register("primaryGuardianId")}>
              <option value="">Choisir un tuteur</option>
              {guardians.data?.map((guardian) => (
                <option key={guardian.id} value={guardian.id}>
                  {guardian.firstName} {guardian.lastName} · {guardian.phone}
                </option>
              ))}
            </select>
          </Field>
          <Link className="text-teal-700 underline" to="/parents">
            Ajouter un parent / tuteur
          </Link>
        </form>
        {errors.matricule || errors.firstName || errors.lastName || errors.primaryGuardianId ? (
          <p className="mt-2 text-sm text-red-600">{t("students.error.required")}</p>
        ) : null}
        {createMutation.data?.possibleDuplicates && createMutation.data.possibleDuplicates.length > 0 ? (
          <p className="mt-2 text-sm text-amber-600">{t("students.possibleDuplicate")}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {students.isPending ? <p className="text-sm text-slate-500">{t("students.loading")}</p> : null}
        {students.isError ? <p className="text-sm text-red-600">{t("students.error.required")}</p> : null}
        {students.data && students.data.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t("students.empty")}</p>
        ) : null}
        {students.data && students.data.data.length > 0 ? (
          <>
            <Table columns={columns} rows={students.data.data} rowKey={(student) => student.id} />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {t("students.pagination.total", { count: students.data.total })}
              </p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  {t("students.pagination.previous")}
                </Button>
                <p className="text-xs text-slate-500">
                  {t("students.pagination.pageInfo", { page, totalPages })}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  {t("students.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
          dismissLabel={t("action.close", { ns: "common" })}
        />
      ) : null}
    </div>
  );
}
