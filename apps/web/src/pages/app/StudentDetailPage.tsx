import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import type { TenantCredentials } from "../../lib/apiClient.js";
import {
  cancelStudentInvoice,
  createStudentInvoice,
  fetchReceiptPdf,
  getStudentFinancialSituation,
  issueStudentInvoice,
  listPaymentsForInvoice,
  listStudentInvoices,
  recordCashPayment,
  refundStudentPayment,
  type StudentInvoiceStatus,
} from "../../lib/financeApi.js";
import { listAcademicYears, listClassrooms } from "../../lib/schoolConfigApi.js";
import { enrollStudent, getStudent, listEnrollments } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

const INVOICE_STATUS_LABELS: Record<StudentInvoiceStatus, string> = {
  DRAFT: "studentDetail.invoiceStatus.DRAFT",
  ISSUED: "studentDetail.invoiceStatus.ISSUED",
  PARTIALLY_PAID: "studentDetail.invoiceStatus.PARTIALLY_PAID",
  PAID: "studentDetail.invoiceStatus.PAID",
  OVERDUE: "studentDetail.invoiceStatus.OVERDUE",
  CANCELLED: "studentDetail.invoiceStatus.CANCELLED",
};

interface InvoiceLine {
  description: string;
  amount: string;
}

function InvoiceDetail({
  invoiceId,
  creds,
  subdomain,
}: {
  invoiceId: string;
  creds: TenantCredentials;
  subdomain: string;
}): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();

  const payments = useQuery({
    queryKey: ["invoice-payments", subdomain, invoiceId],
    queryFn: () => listPaymentsForInvoice(invoiceId, creds),
  });

  const [paymentAmount, setPaymentAmount] = useState("");
  const recordPaymentMutation = useMutation({
    mutationFn: () => recordCashPayment(invoiceId, Math.round(Number(paymentAmount) * 100), creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice-payments", subdomain, invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ["student-invoices", subdomain] });
      void queryClient.invalidateQueries({ queryKey: ["financial-situation", subdomain] });
      setPaymentAmount("");
    },
  });

  const [refunding, setRefunding] = useState<{ paymentId: string; amount: string; reason: string } | null>(
    null,
  );
  const refundMutation = useMutation({
    mutationFn: () => {
      if (!refunding) throw new Error("No payment selected for refund");
      return refundStudentPayment(
        refunding.paymentId,
        { amountCents: Math.round(Number(refunding.amount) * 100), reason: refunding.reason },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice-payments", subdomain, invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ["student-invoices", subdomain] });
      void queryClient.invalidateQueries({ queryKey: ["financial-situation", subdomain] });
      setRefunding(null);
    },
  });

  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  async function openReceipt(receiptId: string): Promise<void> {
    setPdfLoadingId(receiptId);
    try {
      const blob = await fetchReceiptPdf(receiptId, creds);
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setPdfLoadingId(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-900">{t("studentDetail.payments")}</h3>
      {(payments.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">{t("studentDetail.noPayments")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-2 pr-4 font-medium">{t("studentDetail.amount")}</th>
              <th className="pb-2 pr-4 font-medium">{t("studentDetail.paidAt")}</th>
              <th className="pb-2 pr-4" />
              <th className="pb-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {(payments.data ?? []).map((payment) => (
              <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 text-slate-700">{formatAmount(payment.amountCents)}</td>
                <td className="py-2 pr-4 text-slate-700">{payment.paidAt.slice(0, 10)}</td>
                <td className="py-2 pr-4">
                  {payment.receipt ? (
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline disabled:opacity-50"
                      disabled={pdfLoadingId === payment.receipt.id}
                      onClick={() => payment.receipt && void openReceipt(payment.receipt.id)}
                    >
                      {pdfLoadingId === payment.receipt.id
                        ? t("studentDetail.loadingPdf")
                        : t("studentDetail.viewReceipt")}
                    </button>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-600"
                    onClick={() => setRefunding({ paymentId: payment.id, amount: "", reason: "" })}
                  >
                    {t("studentDetail.refund")}
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
          recordPaymentMutation.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input
          type="number"
          step="0.01"
          placeholder={t("studentDetail.amount")}
          className="input w-32"
          value={paymentAmount}
          onChange={(event) => setPaymentAmount(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!paymentAmount}>
          {t("studentDetail.recordPayment")}
        </Button>
      </form>
      {recordPaymentMutation.isError ? (
        <p className="text-sm text-red-600">{t("studentDetail.error.generic")}</p>
      ) : null}

      {refunding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            refundMutation.mutate();
          }}
          className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("studentDetail.amount")}</label>
            <input
              type="number"
              step="0.01"
              className="input mt-1 w-28"
              value={refunding.amount}
              onChange={(event) => setRefunding({ ...refunding, amount: event.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">{t("studentDetail.reason")}</label>
            <input
              className="input mt-1 w-56"
              value={refunding.reason}
              onChange={(event) => setRefunding({ ...refunding, reason: event.target.value })}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!refunding.amount || !refunding.reason}>
            {t("studentDetail.confirmRefund")}
          </Button>
          <button type="button" className="text-xs text-slate-400" onClick={() => setRefunding(null)}>
            {t("grading.cancelCorrection")}
          </button>
        </form>
      ) : null}
      {refundMutation.isError ? (
        <p className="text-sm text-red-600">{t("studentDetail.error.generic")}</p>
      ) : null}
    </div>
  );
}

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
  const years = useQuery({
    queryKey: ["academic-years", session.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const invoices = useQuery({
    queryKey: ["student-invoices", session.subdomain, studentId],
    queryFn: () => listStudentInvoices(creds, { studentId }),
  });
  const situation = useQuery({
    queryKey: ["financial-situation", session.subdomain, studentId],
    queryFn: () => getStudentFinancialSituation(studentId, creds),
  });

  const [invoiceYearId, setInvoiceYearId] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [lineDraft, setLineDraft] = useState<InvoiceLine>({ description: "", amount: "" });

  function addLine(): void {
    if (!lineDraft.description || !lineDraft.amount) return;
    setInvoiceLines((previous) => [...previous, lineDraft]);
    setLineDraft({ description: "", amount: "" });
  }

  function removeLine(index: number): void {
    setInvoiceLines((previous) => previous.filter((_, i) => i !== index));
  }

  const createInvoiceMutation = useMutation({
    mutationFn: () =>
      createStudentInvoice(
        {
          studentId,
          academicYearId: invoiceYearId,
          items: invoiceLines.map((line) => ({
            description: line.description,
            amountCents: Math.round(Number(line.amount) * 100),
          })),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["student-invoices", session.subdomain, studentId] });
      setInvoiceLines([]);
      setInvoiceYearId("");
    },
  });

  const issueInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => issueStudentInvoice(invoiceId, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["student-invoices", session.subdomain, studentId] });
    },
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => cancelStudentInvoice(invoiceId, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["student-invoices", session.subdomain, studentId] });
      void queryClient.invalidateQueries({ queryKey: ["financial-situation", session.subdomain, studentId] });
    },
  });

  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");

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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("studentDetail.billing")}</h2>

        {situation.data ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">{t("studentDetail.totalInvoiced")}</dt>
              <dd className="font-medium text-slate-900">
                {formatAmount(situation.data.totalInvoicedCents)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("studentDetail.totalPaid")}</dt>
              <dd className="font-medium text-slate-900">{formatAmount(situation.data.totalPaidCents)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("studentDetail.outstanding")}</dt>
              <dd className="font-medium text-slate-900">{formatAmount(situation.data.outstandingCents)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("studentDetail.overdueCount")}</dt>
              <dd className="font-medium text-slate-900">{situation.data.overdueInvoices.length}</dd>
            </div>
          </dl>
        ) : null}

        {(invoices.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("studentDetail.noInvoices")}</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("studentDetail.invoiceNumber")}</th>
                <th className="pb-2 pr-4 font-medium">{t("studentDetail.total")}</th>
                <th className="pb-2 pr-4 font-medium">{t("studentDetail.paid")}</th>
                <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(invoices.data ?? []).map((invoice) => (
                <Fragment key={invoice.id}>
                  <tr className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{invoice.number}</td>
                    <td className="py-2 pr-4 text-slate-700">{formatAmount(invoice.totalCents)}</td>
                    <td className="py-2 pr-4 text-slate-700">{formatAmount(invoice.paidCents)}</td>
                    <td className="py-2 pr-4 text-slate-700">{t(INVOICE_STATUS_LABELS[invoice.status])}</td>
                    <td className="py-2 pr-4 flex gap-3">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() =>
                          setSelectedInvoiceId(selectedInvoiceId === invoice.id ? "" : invoice.id)
                        }
                      >
                        {selectedInvoiceId === invoice.id
                          ? t("studentDetail.hidePayments")
                          : t("studentDetail.showPayments")}
                      </button>
                      {invoice.status === "DRAFT" ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-brand-teal"
                          onClick={() => issueInvoiceMutation.mutate(invoice.id)}
                        >
                          {t("studentDetail.issue")}
                        </button>
                      ) : null}
                      {invoice.status !== "CANCELLED" && invoice.paidCents === 0 ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-red-600"
                          onClick={() => cancelInvoiceMutation.mutate(invoice.id)}
                        >
                          {t("studentDetail.cancelInvoice")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {selectedInvoiceId === invoice.id ? (
                    <tr>
                      <td colSpan={5}>
                        <InvoiceDetail invoiceId={invoice.id} creds={creds} subdomain={session.subdomain} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createInvoiceMutation.mutate();
          }}
          className="mt-4 space-y-3 border-t border-slate-100 pt-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <select
              className="input w-48"
              value={invoiceYearId}
              onChange={(event) => setInvoiceYearId(event.target.value)}
            >
              <option value="">{t("config.form.selectYear")}</option>
              {(years.data ?? []).map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          {invoiceLines.length > 0 ? (
            <ul className="space-y-1 text-sm text-slate-700">
              {invoiceLines.map((line, index) => (
                <li key={index} className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span>
                    {line.description} — {formatAmount(Math.round(Number(line.amount) * 100))}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-600"
                    onClick={() => removeLine(index)}
                  >
                    {t("discipline.remove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <input
              placeholder={t("studentDetail.itemDescription")}
              className="input w-48"
              value={lineDraft.description}
              onChange={(event) => setLineDraft({ ...lineDraft, description: event.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("studentDetail.amount")}
              className="input w-28"
              value={lineDraft.amount}
              onChange={(event) => setLineDraft({ ...lineDraft, amount: event.target.value })}
            />
            <Button type="button" variant="secondary" onClick={addLine}>
              {t("studentDetail.addLine")}
            </Button>
          </div>

          <Button type="submit" variant="secondary" disabled={!invoiceYearId || invoiceLines.length === 0}>
            {t("studentDetail.createInvoice")}
          </Button>
        </form>
        {createInvoiceMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">{t("studentDetail.error.generic")}</p>
        ) : null}
      </section>
    </div>
  );
}
