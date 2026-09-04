import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/apiClient.js";
import { fetchReportCardPdf, generateReportCards, listReportCards } from "../../lib/gradingApi.js";
import { listAcademicPeriods, listClassrooms } from "../../lib/schoolConfigApi.js";
import { listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function ReportCardsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });

  const [classroomId, setClassroomId] = useState("");
  const selectedClassroom = classrooms.data?.find((c) => c.id === classroomId);

  const periods = useQuery({
    queryKey: ["academic-periods", session.subdomain, selectedClassroom?.academicYearId],
    queryFn: () => listAcademicPeriods(selectedClassroom?.academicYearId as string, creds),
    enabled: Boolean(selectedClassroom),
  });
  const [academicPeriodId, setAcademicPeriodId] = useState("");

  const roster = useQuery({
    queryKey: ["classroom-roster", session.subdomain, classroomId],
    queryFn: () => listStudents(creds, classroomId),
    enabled: Boolean(classroomId),
  });

  const reportCards = useQuery({
    queryKey: ["report-cards", session.subdomain, classroomId, academicPeriodId],
    queryFn: () => listReportCards(creds, { classroomId, academicPeriodId }),
    enabled: Boolean(classroomId && academicPeriodId),
  });

  const [generateError, setGenerateError] = useState<string | null>(null);
  const generateMutation = useMutation({
    mutationFn: () => generateReportCards({ classroomId, academicPeriodId }, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["report-cards", session.subdomain, classroomId, academicPeriodId],
      });
      setGenerateError(null);
    },
    onError: (error) => {
      setGenerateError(error instanceof ApiError ? error.message : t("reportCards.error.generic"));
    },
  });

  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  async function openPdf(reportCardId: string): Promise<void> {
    setPdfLoadingId(reportCardId);
    try {
      const blob = await fetchReportCardPdf(reportCardId, creds);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } finally {
      setPdfLoadingId(null);
    }
  }

  function studentName(id: string): string {
    const student = roster.data?.find((s) => s.id === id);
    return student ? `${student.firstName} ${student.lastName}` : id;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("reportCards.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("reportCards.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("attendance.classroom")}</label>
            <select
              className="input mt-1 w-56"
              value={classroomId}
              onChange={(event) => {
                setClassroomId(event.target.value);
                setAcademicPeriodId("");
              }}
            >
              <option value="">{t("studentDetail.selectClassroom")}</option>
              {(classrooms.data ?? []).map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("grading.period")}</label>
            <select
              className="input mt-1 w-56"
              value={academicPeriodId}
              onChange={(event) => setAcademicPeriodId(event.target.value)}
              disabled={!classroomId}
            >
              <option value="">{t("grading.selectPeriod")}</option>
              {(periods.data ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          {classroomId && academicPeriodId ? (
            <Button type="button" variant="secondary" onClick={() => generateMutation.mutate()}>
              {generateMutation.isPending ? t("reportCards.generating") : t("reportCards.generate")}
            </Button>
          ) : null}
        </div>
        {generateError ? <p className="mt-2 text-sm text-red-600">{generateError}</p> : null}
      </section>

      {classroomId && academicPeriodId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("reportCards.results")}</h2>

          {(reportCards.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("reportCards.none")}</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("students.firstName")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("reportCards.average")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("reportCards.rank")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("reportCards.mention")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(reportCards.data ?? [])
                  .slice()
                  .sort((a, b) => (a.classRank ?? Infinity) - (b.classRank ?? Infinity))
                  .map((card) => (
                    <tr key={card.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-slate-700">{studentName(card.studentId)}</td>
                      <td className="py-2 pr-4 text-slate-700">{card.averageScore ?? "—"}</td>
                      <td className="py-2 pr-4 text-slate-700">{card.classRank ?? "—"}</td>
                      <td className="py-2 pr-4 text-slate-700">{card.mention ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          className="text-xs text-brand-teal hover:underline disabled:opacity-50"
                          disabled={pdfLoadingId === card.id}
                          onClick={() => void openPdf(card.id)}
                        >
                          {pdfLoadingId === card.id ? t("reportCards.loadingPdf") : t("reportCards.viewPdf")}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </div>
  );
}
