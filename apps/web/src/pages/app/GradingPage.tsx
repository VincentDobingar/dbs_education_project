import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import type { TenantCredentials } from "../../lib/apiClient.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  correctGrade,
  createAssessment,
  listAssessments,
  listAssessmentTypes,
  listGradesForAssessment,
  publishAssessment,
  setGrades,
  type Assessment,
} from "../../lib/gradingApi.js";
import { listAcademicPeriods, listClassrooms, listSubjects } from "../../lib/schoolConfigApi.js";
import { listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const assessmentSchema = z.object({
  subjectId: z.string().min(1),
  assessmentTypeId: z.string().min(1),
  academicPeriodId: z.string().min(1),
  title: z.string().min(1),
  maxScore: z.coerce.number().positive(),
  coefficient: z.coerce.number().positive().optional(),
});

function GradeEntryForm({
  assessment,
  creds,
  subdomain,
}: {
  assessment: Assessment;
  creds: TenantCredentials;
  subdomain: string;
}): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();

  const roster = useQuery({
    queryKey: ["classroom-roster", subdomain, assessment.classroomId],
    queryFn: () => listStudents(creds, assessment.classroomId),
  });
  const grades = useQuery({
    queryKey: ["assessment-grades", subdomain, assessment.id],
    queryFn: () => listGradesForAssessment(assessment.id, creds),
  });

  // Edits only, never seeded from query data (see AttendancePage's RollCallForm for
  // why: a useState initial value freezes while the query is still loading).
  const [edits, setEdits] = useState<Record<string, { score: string; isAbsent: boolean; comment: string }>>(
    {},
  );
  const [correcting, setCorrecting] = useState<{ gradeId: string; score: string; reason: string } | null>(
    null,
  );

  function entryFor(studentId: string): { score: string; isAbsent: boolean; comment: string } {
    if (edits[studentId]) return edits[studentId];
    const saved = (grades.data ?? []).find((g) => g.studentId === studentId);
    return { score: saved?.score ?? "", isAbsent: saved?.isAbsent ?? false, comment: saved?.comment ?? "" };
  }

  function updateEntry(
    studentId: string,
    patch: Partial<{ score: string; isAbsent: boolean; comment: string }>,
  ) {
    setEdits((previous) => ({ ...previous, [studentId]: { ...entryFor(studentId), ...patch } }));
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      setGrades(
        assessment.id,
        (roster.data ?? []).map((student) => {
          const entry = entryFor(student.id);
          return {
            studentId: student.id,
            isAbsent: entry.isAbsent,
            ...(entry.isAbsent ? {} : { score: Number(entry.score) || 0 }),
            ...(entry.comment ? { comment: entry.comment } : {}),
          };
        }),
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assessment-grades", subdomain, assessment.id] });
      setEdits({});
    },
  });

  const correctMutation = useMutation({
    mutationFn: () => {
      if (!correcting) throw new Error("No grade selected for correction");
      return correctGrade(
        correcting.gradeId,
        { isAbsent: false, score: Number(correcting.score) || 0, reason: correcting.reason },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assessment-grades", subdomain, assessment.id] });
      setCorrecting(null);
    },
  });

  if (roster.isPending || grades.isPending) {
    return <p className="text-sm text-slate-500">{t("students.loading")}</p>;
  }
  if ((roster.data ?? []).length === 0) {
    return <p className="text-sm text-slate-500">{t("attendance.emptyRoster")}</p>;
  }

  return (
    <div className="space-y-3">
      {assessment.isPublished ? <p className="text-sm text-amber-600">{t("grading.published")}</p> : null}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="pb-2 pr-4 font-medium">{t("students.firstName")}</th>
            <th className="pb-2 pr-4 font-medium">{t("students.lastName")}</th>
            <th className="pb-2 pr-4 font-medium">{t("grading.score")}</th>
            <th className="pb-2 pr-4 font-medium">{t("grading.absent")}</th>
            <th className="pb-2 pr-4 font-medium">{t("grading.comment")}</th>
            {assessment.isPublished ? <th className="pb-2 pr-4" /> : null}
          </tr>
        </thead>
        <tbody>
          {(roster.data ?? []).map((student) => {
            const entry = entryFor(student.id);
            const savedGrade = (grades.data ?? []).find((g) => g.studentId === student.id);
            return (
              <tr key={student.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 text-slate-700">{student.firstName}</td>
                <td className="py-2 pr-4 text-slate-700">{student.lastName}</td>
                <td className="py-2 pr-4 text-slate-700">
                  {assessment.isPublished ? (
                    (entry.isAbsent ? "—" : entry.score) || "—"
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      className="input w-20 py-1"
                      disabled={entry.isAbsent}
                      value={entry.score}
                      onChange={(event) => updateEntry(student.id, { score: event.target.value })}
                    />
                  )}
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    disabled={assessment.isPublished}
                    checked={entry.isAbsent}
                    onChange={(event) => updateEntry(student.id, { isAbsent: event.target.checked })}
                  />
                </td>
                <td className="py-2 pr-4 text-slate-700">
                  {assessment.isPublished ? (
                    entry.comment || "—"
                  ) : (
                    <input
                      className="input w-32 py-1"
                      value={entry.comment}
                      onChange={(event) => updateEntry(student.id, { comment: event.target.value })}
                    />
                  )}
                </td>
                {assessment.isPublished ? (
                  <td className="py-2 pr-4">
                    {savedGrade ? (
                      <button
                        type="button"
                        className="text-xs text-slate-400 hover:text-brand-teal"
                        onClick={() =>
                          setCorrecting({
                            gradeId: savedGrade.id,
                            score: savedGrade.score ?? "0",
                            reason: "",
                          })
                        }
                      >
                        {t("grading.correct")}
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {!assessment.isPublished ? (
        <>
          <Button type="button" variant="secondary" onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? t("grading.saving") : t("grading.saveGrades")}
          </Button>
          {saveMutation.isSuccess ? (
            <p className="text-sm text-teal-600">{t("grading.gradesSaved")}</p>
          ) : null}
          {saveMutation.isError ? <p className="text-sm text-red-600">{t("grading.error.generic")}</p> : null}
        </>
      ) : null}

      {correcting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            correctMutation.mutate();
          }}
          className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("grading.score")}</label>
            <input
              type="number"
              step="0.01"
              className="input mt-1 w-24"
              value={correcting.score}
              onChange={(event) => setCorrecting({ ...correcting, score: event.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              {t("grading.correctionReason")}
            </label>
            <input
              className="input mt-1 w-56"
              value={correcting.reason}
              onChange={(event) => setCorrecting({ ...correcting, reason: event.target.value })}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!correcting.reason}>
            {t("grading.confirmCorrection")}
          </Button>
          <button type="button" className="text-xs text-slate-400" onClick={() => setCorrecting(null)}>
            {t("grading.cancelCorrection")}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function GradingPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const subjects = useQuery({
    queryKey: ["subjects", session.subdomain],
    queryFn: () => listSubjects(creds),
  });
  const assessmentTypes = useQuery({
    queryKey: ["assessment-types", session.subdomain],
    queryFn: () => listAssessmentTypes(creds),
  });

  const [classroomId, setClassroomId] = useState("");
  const selectedClassroom = classrooms.data?.find((c) => c.id === classroomId);

  const periods = useQuery({
    queryKey: ["academic-periods", session.subdomain, selectedClassroom?.academicYearId],
    queryFn: () => listAcademicPeriods(selectedClassroom?.academicYearId as string, creds),
    enabled: Boolean(selectedClassroom),
  });

  const assessments = useQuery({
    queryKey: ["assessments", session.subdomain, classroomId],
    queryFn: () => listAssessments(creds, { classroomId }),
    enabled: Boolean(classroomId),
  });

  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const selectedAssessment = assessments.data?.find((a) => a.id === selectedAssessmentId);

  const assessmentForm = useForm<z.infer<typeof assessmentSchema>>({
    resolver: zodResolver(assessmentSchema),
  });
  const [formError, setFormError] = useState<string | null>(null);

  const createAssessmentMutation = useMutation({
    mutationFn: (values: z.infer<typeof assessmentSchema>) => {
      const { coefficient, ...rest } = values;
      return createAssessment({ ...rest, classroomId, ...(coefficient ? { coefficient } : {}) }, creds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assessments", session.subdomain, classroomId] });
      assessmentForm.reset();
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : t("grading.error.generic"));
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishAssessment(id, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assessments", session.subdomain, classroomId] });
    },
  });

  function subjectName(id: string): string {
    return subjects.data?.find((s) => s.id === id)?.nameFr ?? id;
  }
  function periodName(id: string): string {
    return periods.data?.find((p) => p.id === id)?.name ?? id;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("grading.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("grading.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-xs font-medium text-slate-600">{t("attendance.classroom")}</label>
        <select
          className="input mt-1 w-56"
          value={classroomId}
          onChange={(event) => {
            setClassroomId(event.target.value);
            setSelectedAssessmentId("");
          }}
        >
          <option value="">{t("studentDetail.selectClassroom")}</option>
          {(classrooms.data ?? []).map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
            </option>
          ))}
        </select>
      </section>

      {classroomId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("grading.assessments")}</h2>

          {(assessments.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("grading.noAssessments")}</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("grading.assessmentTitle")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("config.subjects")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("grading.period")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("grading.maxScore")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("grading.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(assessments.data ?? []).map((assessment) => (
                  <tr key={assessment.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{assessment.title}</td>
                    <td className="py-2 pr-4 text-slate-700">{subjectName(assessment.subjectId)}</td>
                    <td className="py-2 pr-4 text-slate-700">{periodName(assessment.academicPeriodId)}</td>
                    <td className="py-2 pr-4 text-slate-700">{assessment.maxScore}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {assessment.isPublished ? t("grading.publishedStatus") : t("grading.draftStatus")}
                    </td>
                    <td className="py-2 pr-4 flex gap-3">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() => setSelectedAssessmentId(assessment.id)}
                      >
                        {t("grading.enterGrades")}
                      </button>
                      {!assessment.isPublished ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-brand-teal"
                          onClick={() => publishMutation.mutate(assessment.id)}
                        >
                          {t("grading.publish")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form
            onSubmit={(event) =>
              void assessmentForm.handleSubmit((values) => createAssessmentMutation.mutate(values))(event)
            }
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <select className="input w-40" {...assessmentForm.register("subjectId")}>
              <option value="">{t("timetable.selectSubject")}</option>
              {(subjects.data ?? []).map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.nameFr}
                </option>
              ))}
            </select>
            <select className="input w-40" {...assessmentForm.register("assessmentTypeId")}>
              <option value="">{t("grading.selectAssessmentType")}</option>
              {(assessmentTypes.data ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.nameFr}
                </option>
              ))}
            </select>
            <select className="input w-40" {...assessmentForm.register("academicPeriodId")}>
              <option value="">{t("grading.selectPeriod")}</option>
              {(periods.data ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
            <input
              placeholder={t("grading.assessmentTitle")}
              className="input w-40"
              {...assessmentForm.register("title")}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("grading.maxScore")}
              className="input w-24"
              {...assessmentForm.register("maxScore")}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("grading.coefficient")}
              className="input w-24"
              {...assessmentForm.register("coefficient")}
            />
            <Button type="submit" variant="secondary">
              {t("grading.createAssessment")}
            </Button>
          </form>
          {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        </section>
      ) : null}

      {selectedAssessment ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("grading.gradesFor", { title: selectedAssessment.title })}
          </h2>
          <div className="mt-4">
            <GradeEntryForm
              key={selectedAssessment.id}
              assessment={selectedAssessment}
              creds={creds}
              subdomain={session.subdomain}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
