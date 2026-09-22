import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ApiError } from "../../lib/apiClient.js";
import { getCourseForStudent, listCoursesForStudent, markResourceComplete } from "../../lib/elearningApi.js";
import { listLinkedStudents } from "../../lib/familyApi.js";
import { getMySubmission, listHomeworkForStudent, submitHomework } from "../../lib/homeworkApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";
import {
  fetchStudentReceiptPdf,
  fetchStudentReportCardPdf,
  getStudentAnnouncements,
  getStudentDashboard,
  getStudentReceipts,
  getStudentReportCards,
  getStudentTimetable,
} from "../../lib/studentPortalApi.js";
import {
  createStudentInvoice,
  createStudentPaymentIntent,
  createStudentSubscription,
  getStudentSubscription,
  recordStudentCashPayment,
} from "../../lib/subscriptionApi.js";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const STUDENT_PLANS = ["STUDENT_BASIC", "STUDENT_PREMIUM"] as const;

function HomeworkItem({
  homeworkId,
  title,
  dueAt,
  studentId,
  accessToken,
}: {
  homeworkId: string;
  title: string;
  dueAt: string;
  studentId: string;
  accessToken: string;
}): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

  const submission = useQuery({
    queryKey: ["homework-submission", studentId, homeworkId],
    queryFn: () => getMySubmission(studentId, homeworkId, accessToken),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitHomework(studentId, homeworkId, { content }, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["homework-submission", studentId, homeworkId] });
    },
  });

  return (
    <li className="border-b border-slate-100 py-3">
      <div className="flex justify-between">
        <span className="font-medium text-slate-900">{title}</span>
        <span className="text-slate-500">{dueAt.slice(0, 10)}</span>
      </div>
      {submission.data ? (
        <p className="mt-2 text-sm text-teal-600">
          {t("portal.homework.submitted")} — {submission.data.submittedAt.slice(0, 10)}
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitMutation.mutate();
          }}
          className="mt-2 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("portal.homework.contentPlaceholder")}
            className="input w-64"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!content || submitMutation.isPending}>
            {submitMutation.isPending ? t("portal.homework.submitting") : t("portal.homework.submit")}
          </Button>
        </form>
      )}
    </li>
  );
}

function CourseItem({
  studentId,
  courseId,
  title,
  accessToken,
}: {
  studentId: string;
  courseId: string;
  title: string;
  accessToken: string;
}): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const course = useQuery({
    queryKey: ["student-course", studentId, courseId],
    queryFn: () => getCourseForStudent(studentId, courseId, accessToken),
    enabled: expanded,
  });

  const completeMutation = useMutation({
    mutationFn: (resourceId: string) => markResourceComplete(studentId, courseId, resourceId, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["student-course", studentId, courseId] });
    },
  });

  return (
    <li className="border-b border-slate-100 py-3">
      <button
        type="button"
        className="font-medium text-slate-900 hover:underline"
        onClick={() => setExpanded(!expanded)}
      >
        {title}
      </button>
      {expanded && course.data ? (
        <ul className="mt-2 space-y-1 text-sm">
          {course.data.resources.map((resource) => {
            const completed = course.data.completedResourceIds.includes(resource.id);
            return (
              <li key={resource.id} className="flex items-center justify-between">
                <span className="text-slate-700">
                  {resource.title} ({t(`elearning.resourceType.${resource.type}`)})
                </span>
                {completed ? (
                  <span className="text-xs text-teal-600">{t("portal.course.completed")}</span>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-brand-teal hover:underline disabled:opacity-50"
                    disabled={completeMutation.isPending}
                    onClick={() => completeMutation.mutate(resource.id)}
                  >
                    {t("portal.course.markComplete")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function StudentSubscriptionSection({ studentId }: { studentId: string }): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const accessToken = session?.accessToken as string;
  const queryClient = useQueryClient();

  const subscription = useQuery({
    queryKey: ["student-subscription", studentId],
    queryFn: () => getStudentSubscription(studentId, accessToken),
  });

  const [planCode, setPlanCode] = useState<string>(STUDENT_PLANS[0]);
  const [error, setError] = useState<string | null>(null);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      await createStudentSubscription(studentId, { planCode, billingPeriod: "MONTHLY" }, accessToken);
      const invoice = await createStudentInvoice(
        studentId,
        { currencyIsoCode: "XAF", billingName: session?.email ?? "", billingEmail: session?.email ?? "" },
        accessToken,
      );
      const intent = await createStudentPaymentIntent(studentId, invoice.id, accessToken);
      await recordStudentCashPayment(studentId, intent.id, accessToken);
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["student-subscription", studentId] });
    },
    onError: () => setError(t("portal.subscription.error.generic")),
  });

  if (subscription.isPending) {
    return <p className="text-sm text-slate-500">{t("students.loading")}</p>;
  }

  if (subscription.data) {
    return (
      <p className="text-sm text-slate-700">
        {t("portal.subscription.status")}:{" "}
        <strong>{t(`portal.subscriptionStatus.${subscription.data.status}`)}</strong>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("portal.subscription.none")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <select className="input w-48" value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
          {STUDENT_PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          disabled={subscribeMutation.isPending}
          onClick={() => subscribeMutation.mutate()}
        >
          {subscribeMutation.isPending
            ? t("portal.subscription.subscribing")
            : t("portal.subscription.subscribe")}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function StudentPortalPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const accessToken = session?.accessToken as string;
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ["linked-students", accessToken],
    queryFn: () => listLinkedStudents(accessToken),
  });
  const studentId = links.data?.[0]?.student.id;

  const dashboard = useQuery({
    queryKey: ["student-dashboard", studentId],
    queryFn: () => getStudentDashboard(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });
  const timetable = useQuery({
    queryKey: ["student-timetable", studentId],
    queryFn: () => getStudentTimetable(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });
  const reportCards = useQuery({
    queryKey: ["student-report-cards", studentId],
    queryFn: () => getStudentReportCards(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });
  const announcements = useQuery({
    queryKey: ["student-announcements", studentId],
    queryFn: () => getStudentAnnouncements(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });
  const homework = useQuery({
    queryKey: ["student-homework", studentId],
    queryFn: () => listHomeworkForStudent(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });
  const receipts = useQuery({
    queryKey: ["student-receipts", studentId],
    queryFn: () => getStudentReceipts(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });
  const courses = useQuery({
    queryKey: ["student-courses", studentId],
    queryFn: () => listCoursesForStudent(studentId as string, accessToken),
    enabled: Boolean(studentId),
  });

  async function openReportCardPdf(reportCardId: string): Promise<void> {
    if (!studentId) return;
    setPdfLoadingId(reportCardId);
    try {
      const blob = await fetchStudentReportCardPdf(studentId, reportCardId, accessToken);
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setPdfLoadingId(null);
    }
  }

  async function openReceiptPdf(receiptId: string): Promise<void> {
    if (!studentId) return;
    setPdfLoadingId(receiptId);
    try {
      const blob = await fetchStudentReceiptPdf(studentId, receiptId, accessToken);
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setPdfLoadingId(null);
    }
  }

  if (links.isPending) {
    return <p className="mx-auto max-w-4xl px-6 py-10 text-sm text-slate-500">{t("students.loading")}</p>;
  }

  if (!studentId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-slate-600">
          {t("portal.student.notLinked")}{" "}
          <Link to="/portail/activation" className="text-brand-teal hover:underline">
            {t("portal.nav.redeem")}
          </Link>
        </p>
      </div>
    );
  }

  const profile = dashboard.data?.profile.student;

  // Same reasoning as ParentChildPage: every route here but the dashboard itself is
  // gated behind an active individual subscription (§37) — a 402 means "subscribe to
  // unlock", not "there is nothing yet".
  const subscriptionRequired = [timetable, reportCards, announcements, homework, receipts, courses].some(
    (query) => query.error instanceof ApiError && query.error.status === 402,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {profile ? `${profile.firstName} ${profile.lastName}` : t("portal.nav.student")}
        </h1>
        {profile ? (
          <p className="mt-1 text-sm text-slate-500">
            {t("students.matricule")} : {profile.matricule}
          </p>
        ) : null}
      </div>

      {subscriptionRequired ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {t("portal.child.subscriptionRequired")}
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.subscription.title")}</h2>
        <div className="mt-3">
          <StudentSubscriptionSection studentId={studentId} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("timetable.title")}</h2>
        {(timetable.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("timetable.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {(timetable.data ?? [])
              .slice()
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
              .map((entry) => (
                <li key={entry.id} className="flex justify-between border-b border-slate-100 pb-1">
                  <span className="text-slate-700">
                    {t(`timetable.dayOfWeek.${DAY_KEYS[entry.dayOfWeek]}`)} {entry.startTime}–{entry.endTime}
                  </span>
                  <span className="text-slate-500">{entry.roomLabel ?? "—"}</span>
                </li>
              ))}
          </ul>
        )}
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.child.homework")}</h2>
        {(homework.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("portal.child.noHomework")}</p>
        ) : (
          <ul className="mt-1">
            {(homework.data ?? []).map((hw) => (
              <HomeworkItem
                key={hw.id}
                homeworkId={hw.id}
                title={hw.title}
                dueAt={hw.dueAt}
                studentId={studentId}
                accessToken={accessToken}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("portal.course.title")}</h2>
        {(courses.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("portal.course.empty")}</p>
        ) : (
          <ul className="mt-1">
            {(courses.data ?? []).map((course) => (
              <CourseItem
                key={course.id}
                studentId={studentId}
                courseId={course.id}
                title={course.title}
                accessToken={accessToken}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("studentDetail.payments")}</h2>
        {(receipts.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("studentDetail.noPayments")}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
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
        )}
      </section>
    </div>
  );
}
