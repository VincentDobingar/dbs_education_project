import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { TenantCredentials } from "../../lib/apiClient.js";
import {
  fetchPaymentGroupPdf,
  formatMoney,
  getStudentSchedule,
  recordStudentPayment,
  rescheduleInvoice,
  splitInvoice,
  toCents,
  dueLabel,
  type AllocationResult,
  type ScheduleInvoice,
} from "../../lib/feesApi.js";

const OPEN = new Set(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fiche élève : échéancier issu du contrat, encaissement d'un versement réparti
 * (inscription d'abord, puis les plus anciennes), reçu détaillé, et pour la
 * direction, report ou découpage d'une échéance.
 */
export function StudentFeeSchedule({
  studentId,
  creds,
  canCollect,
  canGrantExceptions,
}: {
  studentId: string;
  creds: TenantCredentials;
  canCollect: boolean;
  canGrantExceptions: boolean;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const client = useQueryClient();
  const schedule = useQuery({
    queryKey: ["student-schedule", creds.subdomain, studentId],
    queryFn: () => getStudentSchedule(studentId, creds),
  });
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["student-schedule", creds.subdomain, studentId] });
    void client.invalidateQueries({ queryKey: ["financial-situation", creds.subdomain] });
    void client.invalidateQueries({ queryKey: ["student-invoices", creds.subdomain] });
    void client.invalidateQueries({ queryKey: ["enrollments"] });
  };
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<AllocationResult | null>(null);
  const pay = useMutation({
    mutationFn: () =>
      recordStudentPayment(
        studentId,
        { amountCents: toCents(amount), ...(target ? { invoiceId: target } : {}) },
        creds,
      ),
    onSuccess: (data) => {
      setResult(data);
      setAmount("");
      setTarget("");
      refresh();
    },
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  async function openGroupReceipt(groupId: string): Promise<void> {
    setPdfLoading(true);
    try {
      const blob = await fetchPaymentGroupPdf(groupId, creds);
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setPdfLoading(false);
    }
  }
  const [action, setAction] = useState<{ invoice: ScheduleInvoice; mode: "reschedule" | "split" } | null>(
    null,
  );
  const [actionForm, setActionForm] = useState({
    dueAt: "",
    reason: "",
    parts: [
      { amount: "", dueAt: "" },
      { amount: "", dueAt: "" },
    ],
  });
  const exception = useMutation({
    mutationFn: () => {
      if (!action) throw new Error("no action");
      if (action.mode === "reschedule") {
        return rescheduleInvoice(
          action.invoice.id,
          { dueAt: `${actionForm.dueAt}T00:00:00.000Z`, reason: actionForm.reason },
          creds,
        );
      }
      return splitInvoice(
        action.invoice.id,
        {
          parts: actionForm.parts.map((part) => ({
            amountCents: toCents(part.amount),
            dueAt: `${part.dueAt}T00:00:00.000Z`,
          })),
          reason: actionForm.reason,
        },
        creds,
      );
    },
    onSuccess: () => {
      setAction(null);
      refresh();
    },
  });

  if (schedule.isPending) return null;
  if (schedule.isError) return <p className="text-sm text-red-600">{t("list.error.loadFailed")}</p>;
  const data = schedule.data;
  if (data.invoices.length === 0 && data.agreements.length === 0) return null;
  const now = Date.now();
  const date = (value: string | null): string =>
    value ? new Date(value).toLocaleDateString(i18n.language, { timeZone: "UTC" }) : "—";
  const openInvoices = data.invoices.filter(
    (invoice) => OPEN.has(invoice.status) && invoice.totalCents > invoice.paidCents,
  );
  const agreement = data.agreements[0];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("fees.student.title")}</h2>
          {agreement ? (
            <p className="mt-1 text-sm text-slate-500">
              {agreement.feePlan?.name ?? t("fees.student.noPlan")} ·{" "}
              {agreement.isReturning ? t("fees.profile.RETURNING") : t("fees.profile.NEW")}
              {agreement.discountCents > 0
                ? ` · ${t("fees.student.discounts", { amount: formatMoney(agreement.discountCents) })}`
                : ""}
              {agreement.enrollment.status === "ADMITTED" ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t("fees.student.admitted")}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-slate-500">{t("fees.student.outstanding")}</dt>
            <dd className="font-semibold text-slate-900">{formatMoney(data.outstandingCents)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fees.student.overdue")}</dt>
            <dd className={`font-semibold ${data.overdueCents > 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatMoney(data.overdueCents)}
            </dd>
          </div>
          {data.creditCents > 0 ? (
            <div>
              <dt className="text-slate-500">{t("fees.student.credit")}</dt>
              <dd className="font-semibold text-teal-700">{formatMoney(data.creditCents)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-2 pr-4 font-medium">{t("fees.student.due")}</th>
              <th className="pb-2 pr-4 font-medium">{t("fees.student.date")}</th>
              <th className="pb-2 pr-4 text-right font-medium">{t("fees.student.amount")}</th>
              <th className="pb-2 pr-4 text-right font-medium">{t("fees.student.paid")}</th>
              <th className="pb-2 pr-4 text-right font-medium">{t("fees.student.remaining")}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {data.invoices
              .filter((invoice) => invoice.status !== "DRAFT")
              .map((invoice) => {
                const remaining = Math.max(invoice.totalCents - invoice.paidCents, 0);
                const late =
                  OPEN.has(invoice.status) &&
                  remaining > 0 &&
                  invoice.dueAt !== null &&
                  new Date(invoice.dueAt).getTime() < now;
                return (
                  <tr
                    key={invoice.id}
                    className={`border-b border-slate-100 last:border-0 ${invoice.status === "CANCELLED" ? "text-slate-400 line-through" : ""}`}
                  >
                    <td className="py-2 pr-4">
                      {dueLabel(invoice, t)}
                      <span className="ml-2 text-xs text-slate-400">{invoice.number}</span>
                    </td>
                    <td className={`py-2 pr-4 ${late ? "font-medium text-red-600" : ""}`}>
                      {date(invoice.dueAt)}
                      {late ? ` · ${t("fees.student.late")}` : ""}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatMoney(invoice.totalCents)}</td>
                    <td className="py-2 pr-4 text-right">{formatMoney(invoice.paidCents)}</td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {invoice.status === "CANCELLED" ? "—" : formatMoney(remaining)}
                    </td>
                    <td className="py-2 text-right text-xs">
                      {canGrantExceptions && OPEN.has(invoice.status) && remaining > 0 ? (
                        <span className="flex justify-end gap-3">
                          <button
                            type="button"
                            className="text-brand-teal hover:underline"
                            onClick={() => setAction({ invoice, mode: "reschedule" })}
                          >
                            {t("fees.student.reschedule")}
                          </button>
                          {invoice.paidCents === 0 ? (
                            <button
                              type="button"
                              className="text-brand-teal hover:underline"
                              onClick={() => setAction({ invoice, mode: "split" })}
                            >
                              {t("fees.student.split")}
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {action ? (
        <form
          className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            exception.mutate();
          }}
        >
          <h3 className="font-semibold text-slate-900">
            {action.mode === "reschedule" ? t("fees.student.rescheduleTitle") : t("fees.student.splitTitle")}{" "}
            — {dueLabel(action.invoice, t)} (
            {formatMoney(action.invoice.totalCents - action.invoice.paidCents)})
          </h3>
          {action.mode === "reschedule" ? (
            <label className="block text-xs font-medium text-slate-600">
              {t("fees.student.newDate")}
              <input
                className="input mt-1 block w-44"
                type="date"
                required
                value={actionForm.dueAt}
                onChange={(e) => setActionForm({ ...actionForm, dueAt: e.target.value })}
              />
            </label>
          ) : (
            <div className="space-y-2">
              {actionForm.parts.map((part, index) => (
                <div key={index} className="flex flex-wrap gap-3">
                  <label className="text-xs font-medium text-slate-600">
                    {t("fees.student.partAmount", { n: index + 1 })}
                    <input
                      className="input mt-1 block w-36"
                      type="number"
                      min="1"
                      required
                      value={part.amount}
                      onChange={(e) =>
                        setActionForm({
                          ...actionForm,
                          parts: actionForm.parts.map((p, i) =>
                            i === index ? { ...p, amount: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    {t("fees.student.date")}
                    <input
                      className="input mt-1 block w-44"
                      type="date"
                      required
                      value={part.dueAt}
                      onChange={(e) =>
                        setActionForm({
                          ...actionForm,
                          parts: actionForm.parts.map((p, i) =>
                            i === index ? { ...p, dueAt: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              {actionForm.parts.length < 12 ? (
                <button
                  type="button"
                  className="text-xs text-brand-teal hover:underline"
                  onClick={() =>
                    setActionForm({ ...actionForm, parts: [...actionForm.parts, { amount: "", dueAt: "" }] })
                  }
                >
                  + {t("fees.student.addPart")}
                </button>
              ) : null}
            </div>
          )}
          <label className="block text-xs font-medium text-slate-600">
            {t("fees.student.reason")}
            <input
              className="input mt-1 block w-full max-w-lg"
              required
              minLength={3}
              value={actionForm.reason}
              onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={exception.isPending}>
              {t("fees.save")}
            </Button>
            <Button type="button" variant="primary" onClick={() => setAction(null)}>
              {t("fees.cancel")}
            </Button>
          </div>
          {exception.isError ? <p className="text-red-600">{errorText(exception.error)}</p> : null}
        </form>
      ) : null}

      {canCollect && openInvoices.length > 0 ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            pay.mutate();
          }}
        >
          <h3 className="w-full text-sm font-semibold text-slate-900">{t("fees.student.collect")}</h3>
          <label className="text-xs font-medium text-slate-600">
            {t("fees.student.amountFcfa")}
            <input
              className="input mt-1 block w-40"
              type="number"
              min="1"
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            {t("fees.student.allocation")}
            <select
              className="input mt-1 block w-64"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{t("fees.student.auto")}</option>
              {openInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {dueLabel(invoice, t)} — {formatMoney(invoice.totalCents - invoice.paidCents)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary" disabled={pay.isPending}>
            {t("fees.student.record")}
          </Button>
          {pay.isError ? <p className="w-full text-sm text-red-600">{errorText(pay.error)}</p> : null}
        </form>
      ) : null}

      {result ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900"
        >
          <p className="font-semibold">
            {t("fees.student.recorded", { amount: formatMoney(result.amountCents) })}
          </p>
          <ul className="mt-2 space-y-1">
            {result.lines.map((line) => (
              <li key={line.invoiceId}>
                {line.label} : {formatMoney(line.amountCents)} ·{" "}
                {t("fees.student.remainingShort", { amount: formatMoney(line.remainingCents) })}
              </li>
            ))}
          </ul>
          {result.creditCreatedCents > 0 ? (
            <p className="mt-1">
              {t("fees.student.creditCreated", { amount: formatMoney(result.creditCreatedCents) })}
            </p>
          ) : null}
          {result.activatedEnrollment ? (
            <p className="mt-1 font-medium">{t("fees.student.activated")}</p>
          ) : null}
          {result.lines.length > 0 ? (
            <button
              type="button"
              className="mt-2 font-medium underline disabled:opacity-50"
              disabled={pdfLoading}
              onClick={() => void openGroupReceipt(result.allocationGroupId)}
            >
              {t("fees.student.printReceipt")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
