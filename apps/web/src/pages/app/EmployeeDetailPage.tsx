import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import {
  addEmployeeDocument,
  archiveEmployee,
  createContract,
  createLeaveRequest,
  createPerformanceEvaluation,
  decideLeaveRequest,
  getEmployee,
  listContracts,
  listEmployeeDocuments,
  listLeaveRequests,
  listPerformanceEvaluations,
  listStaffAttendance,
  recordStaffAttendance,
  removeEmployeeDocument,
  updateEmployeeStatus,
  type EmployeeAttendanceStatus,
  type EmployeeStatus,
  type LeaveType,
} from "../../lib/employeesApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const STATUSES: EmployeeStatus[] = ["ACTIVE", "ON_LEAVE", "TERMINATED"];
const LEAVE_TYPES: LeaveType[] = ["ANNUAL", "SICK", "MATERNITY", "UNPAID", "OTHER"];
const ATTENDANCE_STATUSES: EmployeeAttendanceStatus[] = ["PRESENT", "ABSENT", "LATE"];

export function EmployeeDetailPage(): ReactNode {
  const { t } = useTranslation("app");
  const { id } = useParams<{ id: string }>();
  const employeeId = id as string;
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const employee = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(employeeId, creds),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
    void queryClient.invalidateQueries({ queryKey: ["employees", session.subdomain] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: EmployeeStatus) => updateEmployeeStatus(employeeId, status, creds),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveEmployee(employeeId, creds),
    onSuccess: () => {
      // Archived employees 404 on GET /employees/:id (same "gone from normal reads"
      // convention as the rest of this codebase) — navigate away rather than
      // invalidating a detail query that would now fail and render as "not found".
      void queryClient.invalidateQueries({ queryKey: ["employees", session.subdomain] });
      void navigate("/personnel");
    },
  });

  // §27 : RH avancé — contrats, présences, congés, évaluations, documents.
  const contracts = useQuery({
    queryKey: ["employee-contracts", employeeId],
    queryFn: () => listContracts(employeeId, creds),
  });
  const [contractForm, setContractForm] = useState({ contractType: "", startDate: "", salaryCents: "" });
  const createContractMutation = useMutation({
    mutationFn: () =>
      createContract(
        employeeId,
        {
          contractType: contractForm.contractType,
          startDate: contractForm.startDate,
          ...(contractForm.salaryCents ? { salaryCents: Number(contractForm.salaryCents) } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employee-contracts", employeeId] });
      setContractForm({ contractType: "", startDate: "", salaryCents: "" });
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const staffAttendance = useQuery({
    queryKey: ["employee-attendance", employeeId, today],
    queryFn: () => listStaffAttendance(employeeId, { startDate: today, endDate: today }, creds),
  });
  const recordAttendanceMutation = useMutation({
    mutationFn: (status: EmployeeAttendanceStatus) =>
      recordStaffAttendance(employeeId, { date: today, status }, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["employee-attendance", employeeId, today] }),
  });
  const todayAttendance = (staffAttendance.data ?? [])[0];

  const leaveRequests = useQuery({
    queryKey: ["employee-leave-requests", employeeId],
    queryFn: () => listLeaveRequests(employeeId, creds),
  });
  const [leaveForm, setLeaveForm] = useState<{ type: LeaveType; startDate: string; endDate: string }>({
    type: "ANNUAL",
    startDate: "",
    endDate: "",
  });
  const createLeaveMutation = useMutation({
    mutationFn: () => createLeaveRequest(employeeId, leaveForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employee-leave-requests", employeeId] });
      setLeaveForm({ type: "ANNUAL", startDate: "", endDate: "" });
    },
  });
  const decideLeaveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" | "CANCELLED" }) =>
      decideLeaveRequest(employeeId, id, status, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["employee-leave-requests", employeeId] }),
  });

  const evaluations = useQuery({
    queryKey: ["employee-evaluations", employeeId],
    queryFn: () => listPerformanceEvaluations(employeeId, creds),
  });
  const [evalForm, setEvalForm] = useState({ periodStart: "", periodEnd: "", score: "", comments: "" });
  const createEvalMutation = useMutation({
    mutationFn: () =>
      createPerformanceEvaluation(
        employeeId,
        {
          periodStart: evalForm.periodStart,
          periodEnd: evalForm.periodEnd,
          ...(evalForm.score ? { score: Number(evalForm.score) } : {}),
          ...(evalForm.comments ? { comments: evalForm.comments } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employee-evaluations", employeeId] });
      setEvalForm({ periodStart: "", periodEnd: "", score: "", comments: "" });
    },
  });

  const documents = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => listEmployeeDocuments(employeeId, creds),
  });
  const [documentForm, setDocumentForm] = useState({ category: "", fileUrl: "" });
  const addDocumentMutation = useMutation({
    mutationFn: () => addEmployeeDocument(employeeId, documentForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      setDocumentForm({ category: "", fileUrl: "" });
    },
  });
  const removeDocumentMutation = useMutation({
    mutationFn: (id: string) => removeEmployeeDocument(employeeId, id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] }),
  });

  if (employee.isPending) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-500">{t("students.loading")}</p>;
  }
  if (!employee.data) {
    return (
      <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-red-600">{t("employeeDetail.notFound")}</p>
    );
  }

  const isArchived = Boolean(employee.data.deletedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {employee.data.firstName} {employee.data.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("employees.number")} : {employee.data.employeeNumber} — {employee.data.jobTitle}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.status")}</h2>

        {isArchived ? (
          <p className="mt-3 text-sm text-amber-600">{t("employeeDetail.archived")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="input w-40"
              value={employee.data.status}
              onChange={(event) => statusMutation.mutate(event.target.value as EmployeeStatus)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <Button type="button" variant="primary" onClick={() => archiveMutation.mutate()}>
              {t("employeeDetail.archive")}
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.attendanceToday")}</h2>
        <select
          className="input mt-3 w-40"
          value={todayAttendance?.status ?? ""}
          onChange={(event) =>
            recordAttendanceMutation.mutate(event.target.value as EmployeeAttendanceStatus)
          }
        >
          <option value="" disabled>
            {t("transport.selectStatus")}
          </option>
          {ATTENDANCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`employeeDetail.attendanceStatus.${status}`)}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.contracts")}</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(contracts.data ?? []).map((contract) => (
            <li key={contract.id} className="flex justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-700">
                {contract.contractType} — {contract.startDate.slice(0, 10)}
                {contract.endDate ? ` → ${contract.endDate.slice(0, 10)}` : ""}
              </span>
              <span className="text-slate-500">
                {contract.salaryCents !== null ? (contract.salaryCents / 100).toLocaleString("fr-FR") : "—"}
              </span>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createContractMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("employeeDetail.contractType")}
            className="input w-40"
            value={contractForm.contractType}
            onChange={(event) => setContractForm({ ...contractForm, contractType: event.target.value })}
          />
          <input
            type="date"
            className="input"
            value={contractForm.startDate}
            onChange={(event) => setContractForm({ ...contractForm, startDate: event.target.value })}
          />
          <input
            type="number"
            min={0}
            placeholder={t("employeeDetail.salaryCents")}
            className="input w-32"
            value={contractForm.salaryCents}
            onChange={(event) => setContractForm({ ...contractForm, salaryCents: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!contractForm.contractType || !contractForm.startDate}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.leaveRequests")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(leaveRequests.data ?? []).map((leave) => (
            <li key={leave.id} className="border-b border-slate-100 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-700">
                  {t(`employeeDetail.leaveType.${leave.type}`)} — {leave.startDate.slice(0, 10)} →{" "}
                  {leave.endDate.slice(0, 10)}
                </span>
                <span className="text-slate-500">{t(`employeeDetail.leaveStatus.${leave.status}`)}</span>
              </div>
              {leave.status === "PENDING" ? (
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    className="text-xs text-brand-teal hover:underline"
                    onClick={() => decideLeaveMutation.mutate({ id: leave.id, status: "APPROVED" })}
                  >
                    {t("employeeDetail.approve")}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => decideLeaveMutation.mutate({ id: leave.id, status: "REJECTED" })}
                  >
                    {t("employeeDetail.reject")}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createLeaveMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <select
            className="input w-40"
            value={leaveForm.type}
            onChange={(event) => setLeaveForm({ ...leaveForm, type: event.target.value as LeaveType })}
          >
            {LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`employeeDetail.leaveType.${type}`)}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            value={leaveForm.startDate}
            onChange={(event) => setLeaveForm({ ...leaveForm, startDate: event.target.value })}
          />
          <input
            type="date"
            className="input"
            value={leaveForm.endDate}
            onChange={(event) => setLeaveForm({ ...leaveForm, endDate: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={!leaveForm.startDate || !leaveForm.endDate}>
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.evaluations")}</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(evaluations.data ?? []).map((evaluation) => (
            <li key={evaluation.id} className="border-b border-slate-100 pb-1">
              <div className="flex justify-between">
                <span className="text-slate-700">
                  {evaluation.periodStart.slice(0, 10)} → {evaluation.periodEnd.slice(0, 10)}
                </span>
                <span className="text-slate-500">{evaluation.score ?? "—"}</span>
              </div>
              {evaluation.comments ? <p className="text-slate-500">{evaluation.comments}</p> : null}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createEvalMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            type="date"
            className="input"
            value={evalForm.periodStart}
            onChange={(event) => setEvalForm({ ...evalForm, periodStart: event.target.value })}
          />
          <input
            type="date"
            className="input"
            value={evalForm.periodEnd}
            onChange={(event) => setEvalForm({ ...evalForm, periodEnd: event.target.value })}
          />
          <input
            type="number"
            placeholder={t("employeeDetail.score")}
            className="input w-24"
            value={evalForm.score}
            onChange={(event) => setEvalForm({ ...evalForm, score: event.target.value })}
          />
          <input
            placeholder={t("employeeDetail.comments")}
            className="input w-56"
            value={evalForm.comments}
            onChange={(event) => setEvalForm({ ...evalForm, comments: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={!evalForm.periodStart || !evalForm.periodEnd}>
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("employeeDetail.documents")}</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(documents.data ?? []).map((document_) => (
            <li
              key={document_.id}
              className="flex items-center justify-between border-b border-slate-100 pb-1"
            >
              <a
                href={document_.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-teal hover:underline"
              >
                {document_.category}
              </a>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline"
                onClick={() => removeDocumentMutation.mutate(document_.id)}
              >
                {t("admin.common.delete")}
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addDocumentMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("employeeDetail.documentCategory")}
            className="input w-48"
            value={documentForm.category}
            onChange={(event) => setDocumentForm({ ...documentForm, category: event.target.value })}
          />
          <input
            placeholder={t("employeeDetail.documentUrl")}
            className="input w-56"
            value={documentForm.fileUrl}
            onChange={(event) => setDocumentForm({ ...documentForm, fileUrl: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!documentForm.category || !documentForm.fileUrl}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>
    </div>
  );
}
