import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  archiveBook,
  createBook,
  createLoan,
  listBooks,
  listLoans,
  markLoanLost,
  returnLoan,
  type LoanStatus,
} from "../../lib/libraryApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const LOAN_STATUSES: LoanStatus[] = ["ACTIVE", "RETURNED", "LOST"];

export function LibraryPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const books = useQuery({
    queryKey: ["library-books", session.subdomain],
    queryFn: () => listBooks({}, creds),
  });

  const [bookForm, setBookForm] = useState({
    title: "",
    author: "",
    isbn: "",
    category: "",
    totalCopies: "1",
  });
  const createBookMutation = useMutation({
    mutationFn: () =>
      createBook(
        {
          title: bookForm.title,
          author: bookForm.author,
          ...(bookForm.isbn ? { isbn: bookForm.isbn } : {}),
          ...(bookForm.category ? { category: bookForm.category } : {}),
          totalCopies: Number(bookForm.totalCopies) || 1,
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library-books", session.subdomain] });
      setBookForm({ title: "", author: "", isbn: "", category: "", totalCopies: "1" });
    },
  });
  const archiveBookMutation = useMutation({
    mutationFn: (id: string) => archiveBook(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["library-books", session.subdomain] }),
  });

  const [statusFilter, setStatusFilter] = useState<LoanStatus | "">("");
  const loans = useQuery({
    queryKey: ["library-loans", session.subdomain, statusFilter],
    queryFn: () => listLoans({ ...(statusFilter ? { status: statusFilter } : {}) }, creds),
  });

  const [loanBookId, setLoanBookId] = useState("");
  const [loanForm, setLoanForm] = useState({ studentId: "", dueAt: "" });
  const createLoanMutation = useMutation({
    mutationFn: () => createLoan(loanBookId, loanForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library-loans", session.subdomain] });
      setLoanForm({ studentId: "", dueAt: "" });
      setLoanBookId("");
    },
  });
  const returnLoanMutation = useMutation({
    mutationFn: (id: string) => returnLoan(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["library-loans", session.subdomain] }),
  });
  const lostLoanMutation = useMutation({
    mutationFn: (id: string) => markLoanLost(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["library-loans", session.subdomain] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("library.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("library.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("library.books")}</h2>
        {(books.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("library.bookTitle")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("library.author")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("library.copies")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(books.data ?? []).map((book) => (
                  <tr key={book.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{book.title}</td>
                    <td className="py-2 pr-4 text-slate-700">{book.author}</td>
                    <td className="py-2 pr-4 text-slate-700">{book.totalCopies}</td>
                    <td className="py-2 pr-4 text-slate-700">{t(`library.bookStatus.${book.status}`)}</td>
                    <td className="py-2 pr-4 flex gap-3">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() => setLoanBookId(book.id)}
                      >
                        {t("library.lend")}
                      </button>
                      {book.status === "AVAILABLE" ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => archiveBookMutation.mutate(book.id)}
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
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createBookMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("library.bookTitle")}
            className="input w-48"
            value={bookForm.title}
            onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}
          />
          <input
            placeholder={t("library.author")}
            className="input w-48"
            value={bookForm.author}
            onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })}
          />
          <input
            placeholder={t("library.isbn")}
            className="input w-32"
            value={bookForm.isbn}
            onChange={(event) => setBookForm({ ...bookForm, isbn: event.target.value })}
          />
          <input
            placeholder={t("library.category")}
            className="input w-32"
            value={bookForm.category}
            onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })}
          />
          <input
            type="number"
            min={1}
            placeholder={t("library.copies")}
            className="input w-24"
            value={bookForm.totalCopies}
            onChange={(event) => setBookForm({ ...bookForm, totalCopies: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={!bookForm.title || !bookForm.author}>
            {t("admin.common.create")}
          </Button>
        </form>

        {loanBookId ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createLoanMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
          >
            <input
              placeholder={t("library.studentId")}
              className="input w-56"
              value={loanForm.studentId}
              onChange={(event) => setLoanForm({ ...loanForm, studentId: event.target.value })}
            />
            <label className="text-sm font-medium text-slate-700">
              {t("library.dueAt")}
              <input
                type="date"
                className="input mt-1"
                value={loanForm.dueAt}
                onChange={(event) => setLoanForm({ ...loanForm, dueAt: event.target.value })}
              />
            </label>
            <Button
              type="submit"
              variant="secondary"
              disabled={!loanForm.studentId || !loanForm.dueAt || createLoanMutation.isPending}
            >
              {t("library.confirmLend")}
            </Button>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("library.loans")}</h2>
        <select
          className="input mt-3 w-48"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as LoanStatus | "")}
        >
          <option value="">{t("admin.common.allStatuses")}</option>
          {LOAN_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`library.loanStatus.${status}`)}
            </option>
          ))}
        </select>

        {(loans.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("library.studentId")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("library.dueAt")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(loans.data ?? []).map((loan) => (
                  <tr key={loan.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-500">{loan.studentId}</td>
                    <td className="py-2 pr-4 text-slate-700">{loan.dueAt.slice(0, 10)}</td>
                    <td className="py-2 pr-4 text-slate-700">{t(`library.loanStatus.${loan.status}`)}</td>
                    <td className="py-2 pr-4 flex gap-3">
                      {loan.status === "ACTIVE" ? (
                        <>
                          <button
                            type="button"
                            className="text-xs text-brand-teal hover:underline"
                            onClick={() => returnLoanMutation.mutate(loan.id)}
                          >
                            {t("library.markReturned")}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => lostLoanMutation.mutate(loan.id)}
                          >
                            {t("library.markLost")}
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
