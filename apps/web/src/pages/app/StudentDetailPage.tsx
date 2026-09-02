import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { listClassrooms } from "../../lib/schoolConfigApi.js";
import { enrollStudent, getStudent, listEnrollments } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function StudentDetailPage(): ReactNode {
  const { t } = useTranslation("app");
  const { id } = useParams<{ id: string }>();
  const studentId = id as string;
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();
  const [selectedClassroomId, setSelectedClassroomId] = useState("");

  const student = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => getStudent(studentId, creds),
  });
  const enrollments = useQuery({
    queryKey: ["enrollments", studentId],
    queryFn: () => listEnrollments(studentId, creds),
  });
  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });

  const enrollMutation = useMutation({
    mutationFn: () => {
      const classroom = classrooms.data?.find((candidate) => candidate.id === selectedClassroomId);
      if (!classroom) {
        throw new Error("No classroom selected");
      }
      return enrollStudent(
        studentId,
        {
          classroomId: classroom.id,
          academicYearId: classroom.academicYearId,
          campusId: classroom.campusId,
          gradeLevelId: classroom.gradeLevelId,
        },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["enrollments", studentId] });
      void queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      setSelectedClassroomId("");
    },
  });

  if (student.isPending) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-500">{t("students.loading")}</p>;
  }
  if (!student.data) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-red-600">{t("studentDetail.notFound")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {student.data.firstName} {student.data.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("students.matricule")} : {student.data.matricule} — {student.data.status}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("studentDetail.enrollments")}</h2>

        {enrollments.data && enrollments.data.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {enrollments.data.map((enrollment) => {
              const classroom = classrooms.data?.find((c) => c.id === enrollment.classroomId);
              return (
                <li key={enrollment.id} className="flex justify-between border-b border-slate-100 pb-2">
                  <span>{classroom?.name ?? enrollment.classroomId}</span>
                  <span className="text-slate-500">{enrollment.status}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{t("studentDetail.noEnrollment")}</p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            enrollMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <select
            className="input w-56"
            value={selectedClassroomId}
            onChange={(event) => setSelectedClassroomId(event.target.value)}
          >
            <option value="">{t("studentDetail.selectClassroom")}</option>
            {(classrooms.data ?? []).map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={!selectedClassroomId}>
            {t("studentDetail.enroll")}
          </Button>
        </form>
        {enrollMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">{t("studentDetail.enrollError")}</p>
        ) : null}
      </section>
    </div>
  );
}
