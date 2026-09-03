import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { TenantCredentials } from "../../lib/apiClient.js";
import { listAttendance, recordRollCall, type AttendanceStatus } from "../../lib/attendanceApi.js";
import { listClassrooms } from "../../lib/schoolConfigApi.js";
import { listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function RollCallForm({
  classroomId,
  date,
  creds,
  subdomain,
}: {
  classroomId: string;
  date: string;
  creds: TenantCredentials;
  subdomain: string;
}): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();

  const roster = useQuery({
    queryKey: ["classroom-roster", subdomain, classroomId],
    queryFn: () => listStudents(creds, classroomId),
  });
  const existing = useQuery({
    queryKey: ["attendance", subdomain, classroomId, date],
    queryFn: () => listAttendance(creds, { classroomId, date }),
  });

  // Only user-made edits live here — never seeded from `existing.data` via
  // useState's initial value, which freezes at first render (still empty while the
  // query is loading) and is never revisited once real data arrives. The status
  // actually shown per student is resolved at render time instead: an edit here
  // wins, otherwise fall back to what was already saved, otherwise PRESENT.
  const [edits, setEdits] = useState<Record<string, AttendanceStatus>>({});

  function statusFor(studentId: string): AttendanceStatus {
    if (edits[studentId]) return edits[studentId];
    const saved = (existing.data ?? []).find((entry) => entry.studentId === studentId);
    return saved?.status ?? "PRESENT";
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      recordRollCall(
        {
          classroomId,
          date,
          entries: (roster.data ?? []).map((student) => ({
            studentId: student.id,
            status: statusFor(student.id),
          })),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance", subdomain, classroomId, date] });
    },
  });

  if (roster.isPending || existing.isPending) {
    return <p className="text-sm text-slate-500">{t("students.loading")}</p>;
  }

  if ((roster.data ?? []).length === 0) {
    return <p className="text-sm text-slate-500">{t("attendance.emptyRoster")}</p>;
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="pb-2 pr-4 font-medium">{t("students.firstName")}</th>
            <th className="pb-2 pr-4 font-medium">{t("students.lastName")}</th>
            <th className="pb-2 pr-4 font-medium">{t("attendance.status")}</th>
          </tr>
        </thead>
        <tbody>
          {(roster.data ?? []).map((student) => {
            return (
              <tr key={student.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 text-slate-700">{student.firstName}</td>
                <td className="py-2 pr-4 text-slate-700">{student.lastName}</td>
                <td className="py-2 pr-4">
                  <select
                    className="input w-32 py-1"
                    value={statusFor(student.id)}
                    onChange={(event) =>
                      setEdits((previous) => ({
                        ...previous,
                        [student.id]: event.target.value as AttendanceStatus,
                      }))
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`attendance.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Button type="button" variant="secondary" onClick={() => saveMutation.mutate()}>
        {saveMutation.isPending ? t("attendance.saving") : t("attendance.save")}
      </Button>
      {saveMutation.isSuccess ? <p className="text-sm text-teal-600">{t("attendance.saved")}</p> : null}
      {saveMutation.isError ? <p className="text-sm text-red-600">{t("attendance.error.generic")}</p> : null}
    </div>
  );
}

export function AttendancePage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };

  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });

  const [classroomId, setClassroomId] = useState("");
  const [date, setDate] = useState(todayIso());

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("attendance.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("attendance.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("attendance.classroom")}</label>
            <select
              className="input mt-1 w-56"
              value={classroomId}
              onChange={(event) => setClassroomId(event.target.value)}
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
            <label className="block text-xs font-medium text-slate-600">{t("attendance.date")}</label>
            <input
              type="date"
              className="input mt-1 w-40"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </div>
      </section>

      {classroomId && date ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <RollCallForm
            key={`${classroomId}-${date}`}
            classroomId={classroomId}
            date={date}
            creds={creds}
            subdomain={session.subdomain}
          />
        </section>
      ) : null}
    </div>
  );
}
