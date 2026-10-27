import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { ApiError, apiRequest } from "../../lib/apiClient.js";
import { HOMEWORK_KINDS } from "../../lib/homeworkKinds.js";
import {
  fetchChildIdCardPdf,
  fetchChildInvoicePdf,
  fetchChildReceiptPdf,
  fetchChildReportCardPdf,
  getChildAnnouncements,
  getChildAttendance,
  getChildFinancialSituation,
  getChildHomework,
  getChildReceipts,
  getChildReportCards,
  getChildTimetable,
} from "../../lib/parentPortalApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";

import { FamilyCourses } from "./FamilyCourses.js";
import { FamilyFeeSchedule } from "./FamilyFeeSchedule.js";
import { PortalSchoolFollowUp } from "./PortalSchoolFollowUp.js";
import { PortalTimetable } from "./PortalTimetable.js";

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function ParentChildPage(): ReactNode {
  const { studentId } = useParams<{ studentId: string }>();
  const session = loadPortalSession();
  const access = useQuery({
    queryKey: ["parent-child-access", session?.accessToken, studentId],
    queryFn: () =>
      apiRequest(`/parent-portal/children/${studentId}/access`, {
        accessToken: session!.accessToken,
        authContext: "portal",
      }),
    networkMode: "always",
    gcTime: 0,
    retry: false,
    refetchInterval: 60_000,
  });
  if (access.isPending) return <p className="px-6 py-10">Vérification de la couverture…</p>;
  if (access.isError)
    return (
      <div className="px-6 py-10">
        <p role="alert">
          L'accès à cet enfant nécessite un lien vérifié et un abonnement actif couvrant son établissement.
          Une connexion réseau est nécessaire pour vérifier vos droits.
        </p>
        <Link className="text-teal-700 underline" to="/portail/abonnements">
          Gérer mes abonnements
        </Link>
      </div>
    );
  return (
    <>
      {access.fetchStatus !== "idle" && <p className="px-6 py-10">Vérification de la couverture…</p>}
      <div hidden={access.fetchStatus !== "idle"}>
        <ParentChildContent key={studentId} />
      </div>
    </>
  );
}

function ParentChildContent(): ReactNode {
  const { t } = useTranslation("app");
  const { studentId } = useParams<{ studentId: string }>();
  const id = studentId as string;
  const session = loadPortalSession();
  const accessToken = session?.accessToken as string;
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<{ url: string; filename: string } | null>(null);
  useEffect(
    () => () => {
      if (pdfDocument) URL.revokeObjectURL(pdfDocument.url);
    },
    [pdfDocument],
  );

  function showPdf(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    setPdfDocument({ url, filename });
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const attendance = useQuery({
    queryKey: ["child-attendance", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildAttendance(id, accessToken),
  });
  const timetable = useQuery({
    queryKey: ["child-timetable", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildTimetable(id, accessToken),
  });
  const reportCards = useQuery({
    queryKey: ["child-report-cards", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildReportCards(id, accessToken),
  });
  const announcements = useQuery({
    queryKey: ["child-announcements", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildAnnouncements(id, accessToken),
  });
  const homework = useQuery({
    queryKey: ["child-homework", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildHomework(id, accessToken),
  });
  const situation = useQuery({
    queryKey: ["child-finance", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildFinancialSituation(id, accessToken),
  });
  const receipts = useQuery({
    queryKey: ["child-receipts", id, accessToken],
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: () => getChildReceipts(id, accessToken),
  });

  async function openReportCardPdf(reportCardId: string): Promise<void> {
    setPdfLoadingId(reportCardId);
    setPdfError(null);
    try {
      const blob = await fetchChildReportCardPdf(id, reportCardId, accessToken);
      showPdf(blob, `bulletin-${reportCardId}.pdf`);
    } catch (error) {
      setPdfError(
        error instanceof ApiError
          ? t(`portal.child.pdfError.${error.code}`, { defaultValue: t("portal.child.pdfError.generic") })
          : t("portal.child.pdfError.generic"),
      );
    } finally {
      setPdfLoadingId(null);
    }
  }

  async function openIdCardPdf(): Promise<void> {
    setPdfLoadingId("id-card");
    setPdfError(null);
    try {
      showPdf(await fetchChildIdCardPdf(id, accessToken), `carte-scolaire-${id}.pdf`);
    } catch {
      setPdfError(t("portal.child.pdfError.generic"));
    } finally {
      setPdfLoadingId(null);
    }
  }

  async function openInvoicePdf(invoiceId: string): Promise<void> {
    setPdfLoadingId(invoiceId);
    setPdfError(null);
    try {
      showPdf(await fetchChildInvoicePdf(id, invoiceId, accessToken), `facture-${invoiceId}.pdf`);
    } catch {
      setPdfError(t("portal.child.pdfError.generic"));
    } finally {
      setPdfLoadingId(null);
    }
  }

  async function openReceiptPdf(receiptId: string): Promise<void> {
    setPdfLoadingId(receiptId);
    setPdfError(null);
    try {
      const blob = await fetchChildReceiptPdf(id, receiptId, accessToken);
      showPdf(blob, `recu-${receiptId}.pdf`);
    } catch {
      setPdfError(t("portal.child.pdfError.generic"));
    } finally {
      setPdfLoadingId(null);
    }
  }

  // Every child-scoped route but the dashboard itself is gated behind an active
  // family subscription (§37) — a 402 here means "subscribe to unlock", never "there
  // is genuinely nothing yet". Surfacing that distinction matters: silently rendering
  // every section as empty would look like a broken/empty school record instead of a
  // subscription prompt.
  const subscriptionRequired = [attendance, timetable, reportCards, announcements, homework, situation].some(
    (query) => query.error instanceof ApiError && query.error.status === 402,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      {[attendance, timetable, reportCards, announcements, homework, situation, receipts].some(
        (query) => query.isError,
      ) && <p role="alert">{t("list.error.loadFailed")}</p>}
      {pdfError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">
          {pdfError}
        </p>
      )}
      {pdfDocument && (
        <p role="status" className="rounded border border-teal-200 bg-teal-50 p-3">
          {t("portal.child.pdfReady")}{" "}
          <a
            className="font-medium text-teal-800 underline"
            href={pdfDocument.url}
            download={pdfDocument.filename}
          >
            {t("portal.child.downloadPdf")}
          </a>
        </p>
      )}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("portal.child.title")}</h1>
        <button
          type="button"
          className="mt-3 text-sm text-brand-teal hover:underline disabled:opacity-50"
          disabled={pdfLoadingId === "id-card"}
          onClick={() => void openIdCardPdf()}
        >
          {pdfLoadingId === "id-card" ? t("studentDetail.loadingPdf") : t("studentDetail.downloadIdCard")}
        </button>
      </div>

      {subscriptionRequired ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {t("portal.child.subscriptionRequired")}{" "}
          <Link to="/portail/parent" className="font-medium underline">
            {t("portal.subscription.title")}
          </Link>
        </section>
      ) : null}

      <FamilyFeeSchedule studentId={id} accessToken={accessToken} />

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

        {(situation.data?.invoices ?? []).filter((invoice) => invoice.status !== "DRAFT").length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium text-slate-900">Factures</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(situation.data?.invoices ?? [])
                .filter((invoice) => invoice.status !== "DRAFT")
                .map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"
                  >
                    <span>
                      {invoice.number} · {formatAmount(invoice.totalCents)}
                    </span>
                    <button
                      type="button"
                      className="text-brand-teal hover:underline disabled:opacity-50"
                      disabled={pdfLoadingId === invoice.id}
                      onClick={() => void openInvoicePdf(invoice.id)}
                    >
                      {pdfLoadingId === invoice.id ? t("studentDetail.loadingPdf") : "Télécharger la facture"}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {(receipts.data ?? []).length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm">
            {(receipts.data ?? []).map((receipt) => (
              <li
                key={receipt.id}
                className="flex items-center justify-between border-b border-slate-100 pb-1"
              >
                <span className="text-slate-700">{receipt.number}</span>
                <button
                  type="button"
                  className="text-xs text-brand-teal hover:underline disabled:opacity-50"
                  disabled={pdfLoadingId === receipt.id}
                  onClick={() => void openReceiptPdf(receipt.id)}
                >
                  {pdfLoadingId === receipt.id
                    ? t("studentDetail.loadingPdf")
                    : t("studentDetail.viewReceipt")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("reportCards.title")}</h2>
        {(reportCards.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("reportCards.none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("reportCards.average")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("reportCards.rank")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("reportCards.mention")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(reportCards.data ?? []).map((card) => (
                  <tr key={card.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{card.averageScore ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-700">{card.classRank ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-700">{card.mention ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline disabled:opacity-50"
                        disabled={pdfLoadingId === card.id}
                        onClick={() => void openReportCardPdf(card.id)}
                      >
                        {pdfLoadingId === card.id ? t("reportCards.loadingPdf") : t("reportCards.viewPdf")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PortalSchoolFollowUp studentId={id} accessToken={accessToken} parent />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("attendance.title")}</h2>
        {(attendance.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("portal.child.noAttendance")}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {(attendance.data ?? []).slice(0, 10).map((entry) => (
              <li key={entry.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-700">{entry.date.slice(0, 10)}</span>
                <span className="text-slate-500">{t(`attendance.status.${entry.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("timetable.title")}</h2>
        <PortalTimetable
          entries={timetable.data ?? []}
          studentId={studentId!}
          accessToken={accessToken}
          parent
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.child.homework")}</h2>
        {(homework.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("portal.child.noHomework")}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {(homework.data ?? []).map((hw) => (
              <li key={hw.id} className="flex justify-between border-b border-slate-100 pb-1">
                <div className="text-slate-700">
                  {HOMEWORK_KINDS[hw.kind ?? "HOMEWORK"] ?? "Devoir"} · {hw.title}
                  {hw.instructions && <p className="whitespace-pre-line text-sm">{hw.instructions}</p>}
                </div>
                <span className="text-slate-500">{hw.dueAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <FamilyCourses studentId={studentId!} accessToken={accessToken} />
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.child.announcements")}</h2>
        {(announcements.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("portal.child.noAnnouncements")}</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {(announcements.data ?? []).map((announcement) => (
              <li key={announcement.id} className="border-b border-slate-100 pb-2">
                <p className="font-medium text-slate-900">{announcement.title}</p>
                <p className="text-slate-600">{announcement.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
