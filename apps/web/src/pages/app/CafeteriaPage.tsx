import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  archiveMealPlan,
  cancelEnrollment,
  createEnrollment,
  createMealPlan,
  createMenu,
  listEnrollments,
  listMealAttendance,
  listMealPlans,
  listMenus,
  markEnrollmentPaid,
  recordMealAttendance,
  removeMenu,
  type MealAttendanceStatus,
  type MealPlanType,
} from "../../lib/cafeteriaApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const MEAL_PLAN_TYPES: MealPlanType[] = ["DAILY", "WEEKLY", "MONTHLY"];
const ATTENDANCE_STATUSES: MealAttendanceStatus[] = ["SERVED", "ABSENT"];

export function CafeteriaPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const menus = useQuery({
    queryKey: ["cafeteria-menus", session.subdomain],
    queryFn: () => listMenus({}, creds),
  });
  const [menuForm, setMenuForm] = useState({ date: "", description: "" });
  const createMenuMutation = useMutation({
    mutationFn: () => createMenu(menuForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-menus", session.subdomain] });
      setMenuForm({ date: "", description: "" });
    },
  });
  const removeMenuMutation = useMutation({
    mutationFn: (id: string) => removeMenu(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cafeteria-menus", session.subdomain] }),
  });

  const mealPlans = useQuery({
    queryKey: ["cafeteria-meal-plans", session.subdomain],
    queryFn: () => listMealPlans(creds),
  });
  const [planForm, setPlanForm] = useState<{ name: string; type: MealPlanType; priceCents: string }>({
    name: "",
    type: "DAILY",
    priceCents: "",
  });
  const createPlanMutation = useMutation({
    mutationFn: () =>
      createMealPlan(
        { name: planForm.name, type: planForm.type, priceCents: Number(planForm.priceCents) },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-meal-plans", session.subdomain] });
      setPlanForm({ name: "", type: "DAILY", priceCents: "" });
    },
  });
  const archivePlanMutation = useMutation({
    mutationFn: (id: string) => archiveMealPlan(id, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-meal-plans", session.subdomain] }),
  });

  const enrollments = useQuery({
    queryKey: ["cafeteria-enrollments", session.subdomain],
    queryFn: () => listEnrollments({}, creds),
  });
  const [enrollForm, setEnrollForm] = useState({ studentId: "", mealPlanId: "", startDate: "" });
  const createEnrollmentMutation = useMutation({
    mutationFn: () => createEnrollment(enrollForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-enrollments", session.subdomain] });
      setEnrollForm({ studentId: "", mealPlanId: "", startDate: "" });
    },
  });
  const markPaidMutation = useMutation({
    mutationFn: (id: string) => markEnrollmentPaid(id, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-enrollments", session.subdomain] }),
  });
  const cancelEnrollmentMutation = useMutation({
    mutationFn: (id: string) => cancelEnrollment(id, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-enrollments", session.subdomain] }),
  });

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const attendance = useQuery({
    queryKey: ["cafeteria-attendance", selectedEnrollmentId, today],
    queryFn: () => listMealAttendance(selectedEnrollmentId, today, creds),
    enabled: Boolean(selectedEnrollmentId),
  });
  const recordAttendanceMutation = useMutation({
    mutationFn: (status: MealAttendanceStatus) =>
      recordMealAttendance(selectedEnrollmentId, { date: today, status }, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["cafeteria-attendance", selectedEnrollmentId, today] }),
  });
  const todayAttendance = (attendance.data ?? [])[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("cafeteria.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("cafeteria.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("cafeteria.menus")}</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(menus.data ?? []).map((menu) => (
            <li key={menu.id} className="flex items-center justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-700">
                {menu.date.slice(0, 10)} — {menu.description}
              </span>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline"
                onClick={() => removeMenuMutation.mutate(menu.id)}
              >
                {t("admin.common.delete")}
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMenuMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            type="date"
            className="input"
            value={menuForm.date}
            onChange={(event) => setMenuForm({ ...menuForm, date: event.target.value })}
          />
          <input
            placeholder={t("cafeteria.menuDescription")}
            className="input w-64"
            value={menuForm.description}
            onChange={(event) => setMenuForm({ ...menuForm, description: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={!menuForm.date || !menuForm.description}>
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("cafeteria.mealPlans")}</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("cafeteria.planName")}</th>
                <th className="pb-2 pr-4 font-medium">{t("cafeteria.planType")}</th>
                <th className="pb-2 pr-4 font-medium">{t("cafeteria.price")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(mealPlans.data ?? []).map((plan) => (
                <tr key={plan.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{plan.name}</td>
                  <td className="py-2 pr-4 text-slate-700">{t(`cafeteria.planTypeValue.${plan.type}`)}</td>
                  <td className="py-2 pr-4 text-slate-700">{(plan.priceCents / 100).toFixed(2)}</td>
                  <td className="py-2 pr-4">
                    {!plan.deletedAt ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => archivePlanMutation.mutate(plan.id)}
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
            createPlanMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("cafeteria.planName")}
            className="input w-48"
            value={planForm.name}
            onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })}
          />
          <select
            className="input w-40"
            value={planForm.type}
            onChange={(event) => setPlanForm({ ...planForm, type: event.target.value as MealPlanType })}
          >
            {MEAL_PLAN_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`cafeteria.planTypeValue.${type}`)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder={t("cafeteria.priceCents")}
            className="input w-32"
            value={planForm.priceCents}
            onChange={(event) => setPlanForm({ ...planForm, priceCents: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={!planForm.name || !planForm.priceCents}>
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("cafeteria.enrollments")}</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("library.studentId")}</th>
                <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                <th className="pb-2 pr-4 font-medium">{t("cafeteria.paid")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(enrollments.data ?? []).map((enrollment) => (
                <tr key={enrollment.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-500">{enrollment.studentId}</td>
                  <td className="py-2 pr-4 text-slate-700">
                    {t(`cafeteria.enrollmentStatus.${enrollment.status}`)}
                  </td>
                  <td className="py-2 pr-4 text-slate-700">
                    {enrollment.paid ? t("admin.common.active") : "—"}
                  </td>
                  <td className="py-2 pr-4 flex gap-3">
                    {!enrollment.paid ? (
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() => markPaidMutation.mutate(enrollment.id)}
                      >
                        {t("cafeteria.markPaid")}
                      </button>
                    ) : null}
                    {enrollment.status === "ACTIVE" ? (
                      <>
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => cancelEnrollmentMutation.mutate(enrollment.id)}
                        >
                          {t("admin.common.delete")}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-brand-teal hover:underline"
                          onClick={() => setSelectedEnrollmentId(enrollment.id)}
                        >
                          {t("admin.common.open")}
                        </button>
                      </>
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
            createEnrollmentMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("library.studentId")}
            className="input w-56"
            value={enrollForm.studentId}
            onChange={(event) => setEnrollForm({ ...enrollForm, studentId: event.target.value })}
          />
          <select
            className="input w-48"
            value={enrollForm.mealPlanId}
            onChange={(event) => setEnrollForm({ ...enrollForm, mealPlanId: event.target.value })}
          >
            <option value="">{t("cafeteria.selectPlan")}</option>
            {(mealPlans.data ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            value={enrollForm.startDate}
            onChange={(event) => setEnrollForm({ ...enrollForm, startDate: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!enrollForm.studentId || !enrollForm.mealPlanId || !enrollForm.startDate}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      {selectedEnrollmentId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("cafeteria.attendanceToday")}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="input w-40"
              value={todayAttendance?.status ?? ""}
              onChange={(event) =>
                recordAttendanceMutation.mutate(event.target.value as MealAttendanceStatus)
              }
            >
              <option value="" disabled>
                {t("transport.selectStatus")}
              </option>
              {ATTENDANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`cafeteria.attendanceStatus.${status}`)}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : null}
    </div>
  );
}
