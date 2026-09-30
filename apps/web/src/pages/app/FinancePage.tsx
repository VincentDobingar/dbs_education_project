import { Button, Field, Table, Toast, type TableColumn } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  closeCashSession,
  createExpense,
  createExpenseCategory,
  fetchExpenseReportCsv,
  fetchExpenseReportPdf,
  fetchExpenseReportXlsx,
  fetchRevenueReportCsv,
  fetchRevenueReportPdf,
  fetchRevenueReportXlsx,
  getExpenseReport,
  getRevenueReport,
  listCashSessions,
  listExpenseCategories,
  listExpensesPage,
  openCashSession,
  removeExpense,
  type CashSession,
  type Expense,
} from "../../lib/financeApi.js";
import { listCampuses } from "../../lib/schoolConfigApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

const EXPENSES_PAGE_SIZE = 50;

export function FinancePage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const campuses = useQuery({
    queryKey: ["campuses", session.subdomain],
    queryFn: () => listCampuses(creds),
  });

  // Expenses
  const expenseCategories = useQuery({
    queryKey: ["expense-categories", session.subdomain],
    queryFn: () => listExpenseCategories(creds),
  });
  // Pagination réelle côté serveur — les dépenses s'accumulent sans fin, comme les
  // élèves sur StudentsPage.
  const [expensesPage, setExpensesPage] = useState(1);
  const expenses = useQuery({
    queryKey: ["expenses", session.subdomain, expensesPage],
    queryFn: () => listExpensesPage(creds, expensesPage, EXPENSES_PAGE_SIZE),
  });
  const expensesTotalPages = expenses.data
    ? Math.max(1, Math.ceil(expenses.data.total / EXPENSES_PAGE_SIZE))
    : 1;

  const [expenseCategoryCode, setExpenseCategoryCode] = useState("");
  const [expenseCategoryNameFr, setExpenseCategoryNameFr] = useState("");
  const [expenseCategoryNameEn, setExpenseCategoryNameEn] = useState("");
  const createExpenseCategoryMutation = useMutation({
    mutationFn: () =>
      createExpenseCategory(
        { code: expenseCategoryCode, nameFr: expenseCategoryNameFr, nameEn: expenseCategoryNameEn },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expense-categories", session.subdomain] });
      setExpenseCategoryCode("");
      setExpenseCategoryNameFr("");
      setExpenseCategoryNameEn("");
    },
  });

  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [expenseSupplier, setExpenseSupplier] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      createExpense(
        {
          categoryId: expenseCategoryId,
          description: expenseDescription,
          amountCents: Math.round(Number(expenseAmount) * 100),
          expenseDate,
          ...(expenseSupplier ? { supplierName: expenseSupplier } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", session.subdomain] });
      setExpenseCategoryId("");
      setExpenseSupplier("");
      setExpenseDescription("");
      setExpenseAmount("");
      setToast({ message: t("finance.expenseCreated"), variant: "success" });
    },
    onError: () => {
      setToast({ message: t("finance.expenseCreateError"), variant: "error" });
    },
  });

  const removeExpenseMutation = useMutation({
    mutationFn: (id: string) => removeExpense(id, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", session.subdomain] });
      setToast({ message: t("finance.expenseRemoved"), variant: "success" });
    },
    onError: () => {
      setToast({ message: t("finance.expenseRemoveError"), variant: "error" });
    },
  });

  // Cash sessions
  const cashSessions = useQuery({
    queryKey: ["cash-sessions", session.subdomain],
    queryFn: () => listCashSessions(creds),
  });
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingCampusId, setOpeningCampusId] = useState("");
  const openSessionMutation = useMutation({
    mutationFn: () =>
      openCashSession(
        {
          openingBalanceCents: Math.round(Number(openingBalance) * 100),
          ...(openingCampusId ? { campusId: openingCampusId } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cash-sessions", session.subdomain] });
      setOpeningBalance("");
    },
  });
  const [closingBalanceBySession, setClosingBalanceBySession] = useState<Record<string, string>>({});
  const closeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      closeCashSession(sessionId, Math.round(Number(closingBalanceBySession[sessionId] ?? "0") * 100), creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cash-sessions", session.subdomain] });
    },
  });

  const expenseColumns: TableColumn<Expense>[] = [
    { key: "date", header: t("finance.date"), render: (expense) => expense.expenseDate.slice(0, 10) },
    {
      key: "category",
      header: t("finance.category"),
      render: (expense) =>
        expenseCategories.data?.find((c) => c.id === expense.categoryId)?.nameFr ?? expense.categoryId,
    },
    { key: "description", header: t("finance.description"), render: (expense) => expense.description },
    { key: "supplier", header: t("finance.supplier"), render: (expense) => expense.supplierName ?? "—" },
    {
      key: "amount",
      header: t("studentDetail.amount"),
      render: (expense) => formatAmount(expense.amountCents),
    },
    {
      key: "actions",
      header: null,
      render: (expense) => (
        <button
          type="button"
          className="text-xs text-slate-400 hover:text-red-600"
          onClick={() => removeExpenseMutation.mutate(expense.id)}
        >
          {t("discipline.remove")}
        </button>
      ),
    },
  ];

  const cashSessionColumns: TableColumn<CashSession>[] = [
    { key: "openedAt", header: t("finance.openedAt"), render: (session) => session.openedAt.slice(0, 10) },
    {
      key: "openingBalance",
      header: t("finance.openingBalance"),
      render: (session) => formatAmount(session.openingBalanceCents),
    },
    {
      key: "closingBalance",
      header: t("finance.closingBalance"),
      render: (session) =>
        session.closingBalanceCents !== null ? formatAmount(session.closingBalanceCents) : "—",
    },
    {
      key: "status",
      header: t("students.status"),
      render: (session) => t(`finance.cashSessionStatus.${session.status}`),
    },
    {
      key: "actions",
      header: null,
      render: (session) =>
        session.status === "OPEN" ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              placeholder={t("finance.closingBalance")}
              className="input w-28 py-1"
              value={closingBalanceBySession[session.id] ?? ""}
              onChange={(event) =>
                setClosingBalanceBySession((previous) => ({
                  ...previous,
                  [session.id]: event.target.value,
                }))
              }
            />
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline"
              onClick={() => closeSessionMutation.mutate(session.id)}
            >
              {t("finance.closeSession")}
            </button>
          </div>
        ) : null,
    },
  ];

  // Reports
  const [reportStart, setReportStart] = useState(firstOfMonthIso());
  const [reportEnd, setReportEnd] = useState(todayIso());
  const revenueReport = useQuery({
    queryKey: ["revenue-report", session.subdomain, reportStart, reportEnd],
    queryFn: () => getRevenueReport({ startDate: reportStart, endDate: reportEnd }, creds),
  });
  const expenseReport = useQuery({
    queryKey: ["expense-report", session.subdomain, reportStart, reportEnd],
    queryFn: () => getExpenseReport({ startDate: reportStart, endDate: reportEnd }, creds),
  });

  const [exportLoading, setExportLoading] = useState<string | null>(null);
  async function downloadFile(key: string, fetcher: () => Promise<Blob>, filename: string): Promise<void> {
    setExportLoading(key);
    try {
      const blob = await fetcher();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      if (filename.endsWith(".pdf")) {
        window.open(url, "_blank");
      } else {
        link.download = filename;
        link.click();
      }
    } finally {
      setExportLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("finance.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("finance.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("finance.expenseCategories")}</h2>
        {expenseCategories.isError ? (
          <p className="mt-2 text-sm text-red-600">{t("list.error.loadFailed")}</p>
        ) : null}
        {(expenseCategories.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("config.empty")}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
            {(expenseCategories.data ?? []).map((category) => (
              <li key={category.id} className="rounded-full bg-slate-100 px-3 py-1">
                {category.nameFr} ({category.code})
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createExpenseCategoryMutation.mutate();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.code")}
            className="input w-28"
            value={expenseCategoryCode}
            onChange={(event) => setExpenseCategoryCode(event.target.value)}
          />
          <input
            placeholder={t("config.form.nameFr")}
            className="input w-40"
            value={expenseCategoryNameFr}
            onChange={(event) => setExpenseCategoryNameFr(event.target.value)}
          />
          <input
            placeholder={t("config.form.nameEn")}
            className="input w-40"
            value={expenseCategoryNameEn}
            onChange={(event) => setExpenseCategoryNameEn(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("finance.expenses")}</h2>
        {expenses.isError ? <p className="mt-2 text-sm text-red-600">{t("list.error.loadFailed")}</p> : null}
        {(expenses.data?.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("finance.noExpenses")}</p>
        ) : (
          <>
            <div className="mt-3">
              <Table
                columns={expenseColumns}
                rows={expenses.data?.data ?? []}
                rowKey={(expense) => expense.id}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {t("finance.pagination.total", { count: expenses.data?.total ?? 0 })}
              </p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setExpensesPage((current) => Math.max(1, current - 1))}
                  disabled={expensesPage <= 1}
                >
                  {t("list.pagination.previous")}
                </Button>
                <p className="text-xs text-slate-500">
                  {t("list.pagination.pageInfo", { page: expensesPage, totalPages: expensesTotalPages })}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setExpensesPage((current) => Math.min(expensesTotalPages, current + 1))}
                  disabled={expensesPage >= expensesTotalPages}
                >
                  {t("list.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createExpenseMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <select
            className="input w-40"
            value={expenseCategoryId}
            onChange={(event) => setExpenseCategoryId(event.target.value)}
          >
            <option value="">{t("finance.selectCategory")}</option>
            {(expenseCategories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.nameFr}
              </option>
            ))}
          </select>
          <input
            placeholder={t("finance.description")}
            className="input w-40"
            value={expenseDescription}
            onChange={(event) => setExpenseDescription(event.target.value)}
          />
          <input
            placeholder={t("finance.supplier")}
            className="input w-40"
            value={expenseSupplier}
            onChange={(event) => setExpenseSupplier(event.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder={t("studentDetail.amount")}
            className="input w-28"
            value={expenseAmount}
            onChange={(event) => setExpenseAmount(event.target.value)}
          />
          <input
            type="date"
            className="input w-40"
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!expenseCategoryId || !expenseDescription || !expenseAmount}
          >
            {t("config.add")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("finance.cashSessions")}</h2>
        {cashSessions.isError ? (
          <p className="mt-2 text-sm text-red-600">{t("list.error.loadFailed")}</p>
        ) : null}
        {(cashSessions.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("finance.noCashSessions")}</p>
        ) : (
          <div className="mt-3">
            <Table
              columns={cashSessionColumns}
              rows={cashSessions.data ?? []}
              rowKey={(cashSession) => cashSession.id}
            />
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            openSessionMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <select
            className="input w-40"
            value={openingCampusId}
            onChange={(event) => setOpeningCampusId(event.target.value)}
          >
            <option value="">{t("config.form.selectCampus")}</option>
            {(campuses.data ?? []).map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder={t("finance.openingBalance")}
            className="input w-32"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!openingBalance}>
            {t("finance.openSession")}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("finance.reports")}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label={t("finance.startDate")}>
            <input
              type="date"
              className="input w-40"
              value={reportStart}
              onChange={(event) => setReportStart(event.target.value)}
            />
          </Field>
          <Field label={t("finance.endDate")}>
            <input
              type="date"
              className="input w-40"
              value={reportEnd}
              onChange={(event) => setReportEnd(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">{t("finance.revenueReport")}</h3>
          {revenueReport.isError ? (
            <p className="mt-2 text-sm text-red-600">{t("list.error.loadFailed")}</p>
          ) : null}
          {revenueReport.data ? (
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-500">{t("finance.grossRevenue")}</p>
                <p className="font-medium text-slate-900">
                  {formatAmount(revenueReport.data.grossRevenueCents)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">{t("finance.refunded")}</p>
                <p className="font-medium text-slate-900">{formatAmount(revenueReport.data.refundedCents)}</p>
              </div>
              <div>
                <p className="text-slate-500">{t("finance.netRevenue")}</p>
                <p className="font-medium text-slate-900">
                  {formatAmount(revenueReport.data.netRevenueCents)}
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline disabled:opacity-50"
              disabled={exportLoading === "revenue-csv"}
              onClick={() =>
                void downloadFile(
                  "revenue-csv",
                  () => fetchRevenueReportCsv({ startDate: reportStart, endDate: reportEnd }, creds),
                  "rapport-recettes.csv",
                )
              }
            >
              {t("finance.exportCsv")}
            </button>
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline disabled:opacity-50"
              disabled={exportLoading === "revenue-xlsx"}
              onClick={() =>
                void downloadFile(
                  "revenue-xlsx",
                  () => fetchRevenueReportXlsx({ startDate: reportStart, endDate: reportEnd }, creds),
                  "rapport-recettes.xlsx",
                )
              }
            >
              {t("finance.exportExcel")}
            </button>
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline disabled:opacity-50"
              disabled={exportLoading === "revenue-pdf"}
              onClick={() =>
                void downloadFile(
                  "revenue-pdf",
                  () => fetchRevenueReportPdf({ startDate: reportStart, endDate: reportEnd }, creds),
                  "rapport-recettes.pdf",
                )
              }
            >
              {t("finance.exportPdf")}
            </button>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">{t("finance.expenseReport")}</h3>
          {expenseReport.isError ? (
            <p className="mt-2 text-sm text-red-600">{t("list.error.loadFailed")}</p>
          ) : null}
          {expenseReport.data ? (
            <p className="mt-2 text-sm">
              <span className="text-slate-500">{t("finance.totalExpenses")}: </span>
              <span className="font-medium text-slate-900">
                {formatAmount(expenseReport.data.totalExpensesCents)}
              </span>
            </p>
          ) : null}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline disabled:opacity-50"
              disabled={exportLoading === "expense-csv"}
              onClick={() =>
                void downloadFile(
                  "expense-csv",
                  () => fetchExpenseReportCsv({ startDate: reportStart, endDate: reportEnd }, creds),
                  "rapport-depenses.csv",
                )
              }
            >
              {t("finance.exportCsv")}
            </button>
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline disabled:opacity-50"
              disabled={exportLoading === "expense-xlsx"}
              onClick={() =>
                void downloadFile(
                  "expense-xlsx",
                  () => fetchExpenseReportXlsx({ startDate: reportStart, endDate: reportEnd }, creds),
                  "rapport-depenses.xlsx",
                )
              }
            >
              {t("finance.exportExcel")}
            </button>
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline disabled:opacity-50"
              disabled={exportLoading === "expense-pdf"}
              onClick={() =>
                void downloadFile(
                  "expense-pdf",
                  () => fetchExpenseReportPdf({ startDate: reportStart, endDate: reportEnd }, creds),
                  "rapport-depenses.pdf",
                )
              }
            >
              {t("finance.exportPdf")}
            </button>
          </div>
        </div>
      </section>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
          dismissLabel={t("action.close", { ns: "common" })}
        />
      ) : null}
    </div>
  );
}
