import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { cancelHomework, createHomework, listHomework, listSubmissions } from "../../lib/homeworkApi.js";
import { listClassrooms, listSubjects } from "../../lib/schoolConfigApi.js";
import { listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const homeworkSchema = z.object({
  classroomId: z.string().min(1),
  subjectId: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().optional(),
  dueAt: z.string().min(1),
});

export function HomeworkPage(): ReactNode {
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
  const homework = useQuery({
    queryKey: ["homework", session.subdomain],
    queryFn: () => listHomework(creds),
  });

  const form = useForm<z.infer<typeof homeworkSchema>>({ resolver: zodResolver(homeworkSchema) });
  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof homeworkSchema>) => {
      const { instructions, ...rest } = values;
      return createHomework({ ...rest, ...(instructions ? { instructions } : {}) }, creds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["homework", session.subdomain] });
      form.reset();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelHomework(id, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["homework", session.subdomain] });
    },
  });

  const [selectedHomeworkId, setSelectedHomeworkId] = useState("");
  const selectedHomework = homework.data?.find((hw) => hw.id === selectedHomeworkId);
  const submissions = useQuery({
    queryKey: ["homework-submissions", session.subdomain, selectedHomeworkId],
    queryFn: () => listSubmissions(selectedHomeworkId, creds),
    enabled: Boolean(selectedHomeworkId),
  });
  const roster = useQuery({
    queryKey: ["classroom-roster", session.subdomain, selectedHomework?.classroomId],
    queryFn: () => listStudents(creds, selectedHomework?.classroomId),
    enabled: Boolean(selectedHomework),
  });

  function subjectName(id: string): string {
    return subjects.data?.find((subject) => subject.id === id)?.nameFr ?? id;
  }
  function classroomName(id: string): string {
    return classrooms.data?.find((classroom) => classroom.id === id)?.name ?? id;
  }
  function studentName(id: string): string {
    const student = roster.data?.find((candidate) => candidate.id === id);
    return student ? `${student.firstName} ${student.lastName}` : id;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("homework.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("homework.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(homework.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("homework.empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("grading.assessmentTitle")}</th>
                <th className="pb-2 pr-4 font-medium">{t("attendance.classroom")}</th>
                <th className="pb-2 pr-4 font-medium">{t("config.subjects")}</th>
                <th className="pb-2 pr-4 font-medium">{t("homework.dueAt")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(homework.data ?? []).map((hw) => (
                <tr key={hw.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{hw.title}</td>
                  <td className="py-2 pr-4 text-slate-700">{classroomName(hw.classroomId)}</td>
                  <td className="py-2 pr-4 text-slate-700">{subjectName(hw.subjectId)}</td>
                  <td className="py-2 pr-4 text-slate-700">{hw.dueAt.slice(0, 10)}</td>
                  <td className="py-2 pr-4 flex gap-3">
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline"
                      onClick={() => setSelectedHomeworkId(hw.id)}
                    >
                      {t("homework.viewSubmissions")}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-red-600"
                      onClick={() => cancelMutation.mutate(hw.id)}
                    >
                      {t("discipline.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form
          onSubmit={(event) => void form.handleSubmit((values) => createMutation.mutate(values))(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <select className="input w-40" {...form.register("classroomId")}>
            <option value="">{t("studentDetail.selectClassroom")}</option>
            {(classrooms.data ?? []).map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
          <select className="input w-40" {...form.register("subjectId")}>
            <option value="">{t("timetable.selectSubject")}</option>
            {(subjects.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.nameFr}
              </option>
            ))}
          </select>
          <input
            placeholder={t("grading.assessmentTitle")}
            className="input w-48"
            {...form.register("title")}
          />
          <input
            placeholder={t("homework.instructions")}
            className="input w-48"
            {...form.register("instructions")}
          />
          <input type="date" className="input w-40" {...form.register("dueAt")} />
          <Button type="submit" variant="secondary">
            {t("homework.assign")}
          </Button>
        </form>
      </section>

      {selectedHomework ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("homework.submissionsFor", { title: selectedHomework.title })}
          </h2>
          {(submissions.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("homework.noSubmissions")}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {(submissions.data ?? []).map((submission) => (
                <li key={submission.id} className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-700">{studentName(submission.studentId)}</span>
                  <span className="text-slate-500">
                    {t(`homework.submissionStatus.${submission.status}`)} —{" "}
                    {submission.submittedAt.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
