import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addStop,
  assignStudent,
  cancelRoute,
  createRoute,
  createVehicle,
  listRoutes,
  listStops,
  listStudentsForRoute,
  listTransportAttendance,
  listVehicles,
  recordTransportAttendance,
  removeStop,
  retireVehicle,
  unassignStudent,
  type TransportAttendanceStatus,
} from "../../lib/transportApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const ATTENDANCE_STATUSES: TransportAttendanceStatus[] = ["BOARDED", "ABSENT"];

export function TransportPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const vehicles = useQuery({
    queryKey: ["transport-vehicles", session.subdomain],
    queryFn: () => listVehicles(creds),
  });
  const [vehicleForm, setVehicleForm] = useState({ plateNumber: "", model: "", capacity: "" });
  const createVehicleMutation = useMutation({
    mutationFn: () =>
      createVehicle(
        {
          plateNumber: vehicleForm.plateNumber,
          ...(vehicleForm.model ? { model: vehicleForm.model } : {}),
          capacity: Number(vehicleForm.capacity),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transport-vehicles", session.subdomain] });
      setVehicleForm({ plateNumber: "", model: "", capacity: "" });
    },
  });
  const retireVehicleMutation = useMutation({
    mutationFn: (id: string) => retireVehicle(id, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["transport-vehicles", session.subdomain] }),
  });

  const routes = useQuery({
    queryKey: ["transport-routes", session.subdomain],
    queryFn: () => listRoutes(creds),
  });
  const [routeForm, setRouteForm] = useState({ name: "", vehicleId: "" });
  const createRouteMutation = useMutation({
    mutationFn: () =>
      createRoute(
        { name: routeForm.name, ...(routeForm.vehicleId ? { vehicleId: routeForm.vehicleId } : {}) },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transport-routes", session.subdomain] });
      setRouteForm({ name: "", vehicleId: "" });
    },
  });
  const cancelRouteMutation = useMutation({
    mutationFn: (id: string) => cancelRoute(id, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["transport-routes", session.subdomain] }),
  });

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const stops = useQuery({
    queryKey: ["transport-stops", selectedRouteId],
    queryFn: () => listStops(selectedRouteId, creds),
    enabled: Boolean(selectedRouteId),
  });
  const [stopForm, setStopForm] = useState({ label: "", time: "" });
  const addStopMutation = useMutation({
    mutationFn: () =>
      addStop(
        selectedRouteId,
        { label: stopForm.label, ...(stopForm.time ? { time: stopForm.time } : {}) },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transport-stops", selectedRouteId] });
      setStopForm({ label: "", time: "" });
    },
  });
  const removeStopMutation = useMutation({
    mutationFn: (stopId: string) => removeStop(selectedRouteId, stopId, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["transport-stops", selectedRouteId] }),
  });

  const routeStudents = useQuery({
    queryKey: ["transport-route-students", selectedRouteId],
    queryFn: () => listStudentsForRoute(selectedRouteId, creds),
    enabled: Boolean(selectedRouteId),
  });
  const [assignStudentId, setAssignStudentId] = useState("");
  const assignMutation = useMutation({
    mutationFn: () => assignStudent(selectedRouteId, { studentId: assignStudentId }, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transport-route-students", selectedRouteId] });
      setAssignStudentId("");
    },
  });
  const unassignMutation = useMutation({
    mutationFn: (studentId: string) => unassignStudent(studentId, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["transport-route-students", selectedRouteId] }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const attendance = useQuery({
    queryKey: ["transport-attendance", selectedRouteId, today],
    queryFn: () => listTransportAttendance(selectedRouteId, today, creds),
    enabled: Boolean(selectedRouteId),
  });
  const recordAttendanceMutation = useMutation({
    mutationFn: ({ studentId, status }: { studentId: string; status: TransportAttendanceStatus }) =>
      recordTransportAttendance(selectedRouteId, { studentId, date: today, status }, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["transport-attendance", selectedRouteId, today] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("transport.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("transport.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("transport.vehicles")}</h2>
        {(vehicles.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("transport.plateNumber")}</th>
                <th className="pb-2 pr-4 font-medium">{t("transport.capacity")}</th>
                <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(vehicles.data ?? []).map((vehicle) => (
                <tr key={vehicle.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{vehicle.plateNumber}</td>
                  <td className="py-2 pr-4 text-slate-700">{vehicle.capacity}</td>
                  <td className="py-2 pr-4 text-slate-700">
                    {t(`transport.vehicleStatus.${vehicle.status}`)}
                  </td>
                  <td className="py-2 pr-4">
                    {vehicle.status !== "RETIRED" ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => retireVehicleMutation.mutate(vehicle.id)}
                      >
                        {t("transport.retire")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createVehicleMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("transport.plateNumber")}
            className="input w-40"
            value={vehicleForm.plateNumber}
            onChange={(event) => setVehicleForm({ ...vehicleForm, plateNumber: event.target.value })}
          />
          <input
            placeholder={t("transport.model")}
            className="input w-40"
            value={vehicleForm.model}
            onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })}
          />
          <input
            type="number"
            min={1}
            placeholder={t("transport.capacity")}
            className="input w-28"
            value={vehicleForm.capacity}
            onChange={(event) => setVehicleForm({ ...vehicleForm, capacity: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!vehicleForm.plateNumber || !vehicleForm.capacity}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("transport.routes")}</h2>
        {(routes.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("transport.routeName")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(routes.data ?? []).map((route) => (
                <tr key={route.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{route.name}</td>
                  <td className="py-2 pr-4 flex gap-3">
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline"
                      onClick={() => setSelectedRouteId(route.id)}
                    >
                      {t("admin.common.open")}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => cancelRouteMutation.mutate(route.id)}
                    >
                      {t("admin.common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createRouteMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("transport.routeName")}
            className="input w-48"
            value={routeForm.name}
            onChange={(event) => setRouteForm({ ...routeForm, name: event.target.value })}
          />
          <select
            className="input w-48"
            value={routeForm.vehicleId}
            onChange={(event) => setRouteForm({ ...routeForm, vehicleId: event.target.value })}
          >
            <option value="">{t("transport.noVehicle")}</option>
            {(vehicles.data ?? []).map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={!routeForm.name}>
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      {selectedRouteId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("transport.stops")}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {(stops.data ?? []).map((stop) => (
              <li key={stop.id} className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-700">
                  {stop.order}. {stop.label} {stop.time ? `— ${stop.time}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => removeStopMutation.mutate(stop.id)}
                >
                  {t("admin.common.delete")}
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addStopMutation.mutate();
            }}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("transport.stopLabel")}
              className="input w-48"
              value={stopForm.label}
              onChange={(event) => setStopForm({ ...stopForm, label: event.target.value })}
            />
            <input
              placeholder="HH:MM"
              className="input w-24"
              value={stopForm.time}
              onChange={(event) => setStopForm({ ...stopForm, time: event.target.value })}
            />
            <Button type="submit" variant="secondary" disabled={!stopForm.label}>
              {t("admin.common.create")}
            </Button>
          </form>

          <h2 className="mt-6 text-lg font-semibold text-slate-900">{t("transport.assignedStudents")}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {(routeStudents.data ?? []).map((assignment) => (
              <li
                key={assignment.id}
                className="flex items-center justify-between border-b border-slate-100 pb-1"
              >
                <span className="font-mono text-xs text-slate-500">{assignment.studentId}</span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => unassignMutation.mutate(assignment.studentId)}
                >
                  {t("transport.unassign")}
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              assignMutation.mutate();
            }}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("library.studentId")}
              className="input w-56"
              value={assignStudentId}
              onChange={(event) => setAssignStudentId(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!assignStudentId}>
              {t("transport.assign")}
            </Button>
          </form>

          <h2 className="mt-6 text-lg font-semibold text-slate-900">{t("transport.attendanceToday")}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {(routeStudents.data ?? []).map((assignment) => {
              const today_ = (attendance.data ?? []).find((a) => a.studentId === assignment.studentId);
              return (
                <li
                  key={assignment.id}
                  className="flex items-center justify-between border-b border-slate-100 pb-1"
                >
                  <span className="font-mono text-xs text-slate-500">{assignment.studentId}</span>
                  <select
                    className="input w-40"
                    value={today_?.status ?? ""}
                    onChange={(event) =>
                      recordAttendanceMutation.mutate({
                        studentId: assignment.studentId,
                        status: event.target.value as TransportAttendanceStatus,
                      })
                    }
                  >
                    <option value="" disabled>
                      {t("transport.selectStatus")}
                    </option>
                    {ATTENDANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`transport.attendanceStatus.${status}`)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
