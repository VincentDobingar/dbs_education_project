import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/apiClient.js";
import { listEmployees } from "../../lib/employeesApi.js";
import { listClassrooms, listRooms, listSubjects, type Classroom } from "../../lib/schoolConfigApi.js";
import {
  addTimetableEntry,
  createTimetable,
  listTimetableEntries,
  listTimetables,
  removeTimetableEntry,
} from "../../lib/timetableApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function TimetablePage(): ReactNode {
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
  const employees = useQuery({
    queryKey: ["employees", session.subdomain],
    queryFn: () => listEmployees(creds),
  });
  const rooms = useQuery({
    queryKey: ["rooms", session.subdomain],
    queryFn: () => listRooms(creds),
  });

  const [classroomId, setClassroomId] = useState("");
  const selectedClassroom: Classroom | undefined = classrooms.data?.find((c) => c.id === classroomId);

  const timetables = useQuery({
    queryKey: ["timetables", session.subdomain, classroomId],
    queryFn: () => listTimetables(creds, { classroomId }),
    enabled: Boolean(classroomId),
  });
  const timetable = timetables.data?.[0] ?? null;

  const createTimetableMutation = useMutation({
    mutationFn: () => {
      if (!selectedClassroom) throw new Error("No classroom selected");
      return createTimetable(
        { classroomId: selectedClassroom.id, academicYearId: selectedClassroom.academicYearId },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timetables", session.subdomain, classroomId] });
    },
  });

  const entries = useQuery({
    queryKey: ["timetable-entries", timetable?.id],
    queryFn: () => listTimetableEntries(timetable?.id as string, creds),
    enabled: Boolean(timetable),
  });

  const [subjectId, setSubjectId] = useState("");
  const [teacherEmployeeId, setTeacherEmployeeId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [roomLabel, setRoomLabel] = useState("");
  const [roomId, setRoomId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addEntryMutation = useMutation({
    mutationFn: () => {
      if (!timetable) throw new Error("No timetable");
      return addTimetableEntry(
        timetable.id,
        {
          subjectId,
          teacherEmployeeId,
          dayOfWeek: Number(dayOfWeek),
          startTime,
          endTime,
          ...(roomLabel ? { roomLabel } : {}),
          ...(roomId ? { roomId } : {}),
        },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timetable-entries", timetable?.id] });
      setSubjectId("");
      setTeacherEmployeeId("");
      setRoomLabel("");
      setRoomId("");
      setFormError(null);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.code === "ROOM_SCHEDULE_CONFLICT") {
        setFormError(t("timetable.error.roomConflict"));
        return;
      }
      setFormError(t("timetable.error.generic"));
    },
  });

  const removeEntryMutation = useMutation({
    mutationFn: (entryId: string) => removeTimetableEntry(timetable?.id as string, entryId, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timetable-entries", timetable?.id] });
    },
  });

  function employeeName(id: string): string {
    const employee = employees.data?.find((candidate) => candidate.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}` : id;
  }

  function subjectName(id: string): string {
    return subjects.data?.find((candidate) => candidate.id === id)?.nameFr ?? id;
  }

  function roomName(id: string): string {
    return rooms.data?.find((candidate) => candidate.id === id)?.name ?? id;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("timetable.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("timetable.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
      </section>

      {classroomId && timetables.isFetched && !timetable ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">{t("timetable.none")}</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => createTimetableMutation.mutate()}
          >
            {t("timetable.create")}
          </Button>
        </section>
      ) : null}

      {timetable ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("timetable.entries")}</h2>

          {(entries.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("timetable.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pr-4 font-medium">{t("timetable.day")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("timetable.time")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("timetable.subject")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("timetable.teacher")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("timetable.room")}</th>
                    <th className="pb-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {(entries.data ?? [])
                    .slice()
                    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
                    .map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 text-slate-700">
                          {t(`timetable.dayOfWeek.${DAY_KEYS[entry.dayOfWeek]}`)}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">
                          {entry.startTime}–{entry.endTime}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">{subjectName(entry.subjectId)}</td>
                        <td className="py-2 pr-4 text-slate-700">{employeeName(entry.teacherEmployeeId)}</td>
                        <td className="py-2 pr-4 text-slate-700">
                          {entry.roomId ? roomName(entry.roomId) : (entry.roomLabel ?? "—")}
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => removeEntryMutation.mutate(entry.id)}
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            {t("discipline.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              addEntryMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <select
              className="input w-28"
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(event.target.value)}
            >
              {DAY_KEYS.map((key, index) => (
                <option key={key} value={index}>
                  {t(`timetable.dayOfWeek.${key}`)}
                </option>
              ))}
            </select>
            <input
              type="time"
              className="input w-28"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <input
              type="time"
              className="input w-28"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
            <select
              className="input w-40"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              <option value="">{t("timetable.selectSubject")}</option>
              {(subjects.data ?? []).map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.nameFr}
                </option>
              ))}
            </select>
            <select
              className="input w-40"
              value={teacherEmployeeId}
              onChange={(event) => setTeacherEmployeeId(event.target.value)}
            >
              <option value="">{t("timetable.selectTeacher")}</option>
              {(employees.data ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </select>
            <select
              className="input w-40"
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value);
                if (event.target.value) setRoomLabel("");
              }}
            >
              <option value="">{t("timetable.selectRoom")}</option>
              {(rooms.data ?? []).map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <input
              placeholder={t("timetable.room")}
              className="input w-28"
              value={roomLabel}
              disabled={Boolean(roomId)}
              onChange={(event) => setRoomLabel(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!subjectId || !teacherEmployeeId}>
              {t("timetable.add")}
            </Button>
          </form>
          {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
