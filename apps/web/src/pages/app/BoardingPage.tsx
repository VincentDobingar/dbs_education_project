import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addBed,
  archiveRoom,
  assignStudent,
  createRoom,
  listBeds,
  listDormitoryAttendance,
  listRooms,
  recordDormitoryAttendance,
  removeBed,
  unassignStudent,
  type DormitoryAttendanceStatus,
} from "../../lib/boardingApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const ATTENDANCE_STATUSES: DormitoryAttendanceStatus[] = ["PRESENT", "ABSENT"];

export function BoardingPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const rooms = useQuery({
    queryKey: ["boarding-rooms", session.subdomain],
    queryFn: () => listRooms(creds),
  });
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "" });
  const createRoomMutation = useMutation({
    mutationFn: () => createRoom({ name: roomForm.name, capacity: Number(roomForm.capacity) }, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["boarding-rooms", session.subdomain] });
      setRoomForm({ name: "", capacity: "" });
    },
  });
  const archiveRoomMutation = useMutation({
    mutationFn: (id: string) => archiveRoom(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["boarding-rooms", session.subdomain] }),
  });

  const [selectedRoomId, setSelectedRoomId] = useState("");
  const beds = useQuery({
    queryKey: ["boarding-beds", selectedRoomId],
    queryFn: () => listBeds(selectedRoomId, creds),
    enabled: Boolean(selectedRoomId),
  });
  const [bedLabel, setBedLabel] = useState("");
  const addBedMutation = useMutation({
    mutationFn: () => addBed(selectedRoomId, bedLabel, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["boarding-beds", selectedRoomId] });
      setBedLabel("");
    },
  });
  const removeBedMutation = useMutation({
    mutationFn: (bedId: string) => removeBed(selectedRoomId, bedId, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["boarding-beds", selectedRoomId] }),
  });

  const [assignBedId, setAssignBedId] = useState("");
  const [assignForm, setAssignForm] = useState({ studentId: "", startDate: "" });
  const assignMutation = useMutation({
    mutationFn: () => assignStudent(selectedRoomId, assignBedId, assignForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["boarding-beds", selectedRoomId] });
      setAssignForm({ studentId: "", startDate: "" });
      setAssignBedId("");
    },
  });
  const unassignMutation = useMutation({
    mutationFn: (studentId: string) => unassignStudent(studentId, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["boarding-beds", selectedRoomId] }),
  });

  const [attendanceStudentId, setAttendanceStudentId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const attendance = useQuery({
    queryKey: ["boarding-attendance", attendanceStudentId, today],
    queryFn: () => listDormitoryAttendance(attendanceStudentId, today, creds),
    enabled: Boolean(attendanceStudentId),
  });
  const recordAttendanceMutation = useMutation({
    mutationFn: (status: DormitoryAttendanceStatus) =>
      recordDormitoryAttendance(attendanceStudentId, { date: today, status }, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["boarding-attendance", attendanceStudentId, today] }),
  });
  const todayAttendance = (attendance.data ?? [])[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("boarding.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("boarding.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("boarding.rooms")}</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("boarding.roomName")}</th>
                <th className="pb-2 pr-4 font-medium">{t("transport.capacity")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(rooms.data ?? []).map((room) => (
                <tr key={room.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{room.name}</td>
                  <td className="py-2 pr-4 text-slate-700">{room.capacity}</td>
                  <td className="py-2 pr-4 flex gap-3">
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline"
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      {t("admin.common.open")}
                    </button>
                    {!room.deletedAt ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => archiveRoomMutation.mutate(room.id)}
                      >
                        {t("admin.common.delete")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createRoomMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("boarding.roomName")}
            className="input w-48"
            value={roomForm.name}
            onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })}
          />
          <input
            type="number"
            min={1}
            placeholder={t("transport.capacity")}
            className="input w-28"
            value={roomForm.capacity}
            onChange={(event) => setRoomForm({ ...roomForm, capacity: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={!roomForm.name || !roomForm.capacity}>
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      {selectedRoomId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("boarding.beds")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(beds.data ?? []).map((bed) => (
              <li key={bed.id} className="border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{bed.label}</span>
                  {!bed.assignment ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => removeBedMutation.mutate(bed.id)}
                    >
                      {t("admin.common.delete")}
                    </button>
                  ) : null}
                </div>
                {bed.assignment ? (
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">{bed.assignment.studentId}</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="text-brand-teal hover:underline"
                        onClick={() => setAttendanceStudentId(bed.assignment!.studentId)}
                      >
                        {t("boarding.attendance")}
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => unassignMutation.mutate(bed.assignment!.studentId)}
                      >
                        {t("transport.unassign")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-1 text-xs text-brand-teal hover:underline"
                    onClick={() => setAssignBedId(bed.id)}
                  >
                    {t("boarding.assignBed")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addBedMutation.mutate();
            }}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("boarding.bedLabel")}
              className="input w-40"
              value={bedLabel}
              onChange={(event) => setBedLabel(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!bedLabel}>
              {t("admin.common.create")}
            </Button>
          </form>

          {assignBedId ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                assignMutation.mutate();
              }}
              className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
            >
              <input
                placeholder={t("library.studentId")}
                className="input w-56"
                value={assignForm.studentId}
                onChange={(event) => setAssignForm({ ...assignForm, studentId: event.target.value })}
              />
              <input
                type="date"
                className="input"
                value={assignForm.startDate}
                onChange={(event) => setAssignForm({ ...assignForm, startDate: event.target.value })}
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!assignForm.studentId || !assignForm.startDate}
              >
                {t("boarding.confirmAssign")}
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}

      {attendanceStudentId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("boarding.attendanceToday")}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{attendanceStudentId}</p>
          <select
            className="input mt-3 w-40"
            value={todayAttendance?.status ?? ""}
            onChange={(event) =>
              recordAttendanceMutation.mutate(event.target.value as DormitoryAttendanceStatus)
            }
          >
            <option value="" disabled>
              {t("transport.selectStatus")}
            </option>
            {ATTENDANCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`boarding.attendanceStatus.${status}`)}
              </option>
            ))}
          </select>
        </section>
      ) : null}
    </div>
  );
}
