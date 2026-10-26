import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { RemedialCatalog } from "../../components/RemedialCatalog.js";
import { ApiError } from "../../lib/apiClient.js";
import { loadPortalSession } from "../../lib/portalSession.js";
import {
  cancelEnrollment,
  enroll,
  formatAmount,
  getPaymentOptions,
  getPaymentStatus,
  listLearners,
  listMyEnrollments,
  payOnline,
  type CatalogOffer,
  type MyEnrollment,
} from "../../lib/remedialApi.js";

function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation("app");
  return (error) => {
    if (error instanceof ApiError) {
      const key = `remedial.error.${error.code}`;
      const text = t(key);
      return text === key ? t("remedial.error.generic") : text;
    }
    return t("remedial.error.generic");
  };
}

/** Portail famille : catalogue, inscription d'un enfant (ou de soi-même) et paiement. */
export function PortalRemedialPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const token = session?.accessToken ?? "";
  const [tab, setTab] = useState<"catalog" | "mine">("catalog");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("remedial.portal.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{t("remedial.portal.subtitle")}</p>
      </div>
      <div className="flex gap-2" role="tablist">
        {(["catalog", "mine"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === key ? "bg-brand-night text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {t(`remedial.portal.tab.${key}`)}
          </button>
        ))}
      </div>
      {tab === "catalog" ? (
        <Catalog token={token} onEnrolled={() => setTab("mine")} />
      ) : (
        <MyEnrollments token={token} />
      )}
    </div>
  );
}

function Catalog({ token, onEnrolled }: { token: string; onEnrolled: () => void }): ReactNode {
  const { t } = useTranslation("app");
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const learners = useQuery({ queryKey: ["remedial-learners", token], queryFn: () => listLearners(token) });
  const [choosing, setChoosing] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const enrollMutation = useMutation({
    mutationFn: (offer: CatalogOffer) => enroll(offer.id, studentId, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["remedial-enrollments"] });
      void queryClient.invalidateQueries({ queryKey: ["remedial-catalog"] });
      setChoosing(null);
      onEnrolled();
    },
  });

  return (
    <RemedialCatalog
      renderAction={(offer) => {
        if (offer.seatsLeft === 0) return null;
        if ((learners.data ?? []).length === 0)
          return <p className="text-xs text-slate-500">{t("remedial.portal.noLearner")}</p>;
        if (choosing !== offer.id)
          return (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setChoosing(offer.id);
                setStudentId(learners.data?.[0]?.studentId ?? "");
                enrollMutation.reset();
              }}
            >
              {t("remedial.portal.enroll")}
            </Button>
          );
        return (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <label className="block text-xs font-medium text-slate-600">
              {t("remedial.portal.whichStudent")}
              <select
                className="input mt-1 w-full"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                {(learners.data ?? []).map((learner) => (
                  <option key={learner.studentId} value={learner.studentId}>
                    {learner.firstName} {learner.lastName} — {learner.schoolName}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!studentId || enrollMutation.isPending}
                onClick={() => enrollMutation.mutate(offer)}
              >
                {t("remedial.portal.confirmEnroll")}
              </Button>
              <Button type="button" variant="primary" onClick={() => setChoosing(null)}>
                {t("remedial.action.cancel")}
              </Button>
            </div>
            {enrollMutation.isError ? (
              <p className="text-sm text-red-600">{errorText(enrollMutation.error)}</p>
            ) : null}
          </div>
        );
      }}
    />
  );
}

function MyEnrollments({ token }: { token: string }): ReactNode {
  const { t } = useTranslation("app");
  const enrollments = useQuery({
    queryKey: ["remedial-enrollments", token],
    queryFn: () => listMyEnrollments(token),
  });
  if (enrollments.isPending) return <p className="text-sm text-slate-500">{t("remedial.loading")}</p>;
  if ((enrollments.data ?? []).length === 0)
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        {t("remedial.portal.noEnrollment")}
      </p>
    );
  return (
    <ul className="space-y-3">
      {(enrollments.data ?? []).map((enrollment) => (
        <EnrollmentCard key={enrollment.id} enrollment={enrollment} token={token} />
      ))}
    </ul>
  );
}

function EnrollmentCard({ enrollment, token }: { enrollment: MyEnrollment; token: string }): ReactNode {
  const { t, i18n } = useTranslation("app");
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [providerCode, setProviderCode] = useState("");
  const [phone, setPhone] = useState("");
  const [pendingIntent, setPendingIntent] = useState<{ id: string; message: string | null } | null>(null);
  const options = useQuery({
    queryKey: ["remedial-payment-options", enrollment.id],
    queryFn: () => getPaymentOptions(enrollment.id, token),
    enabled: paying,
  });
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ["remedial-enrollments"] });
  const pay = useMutation({
    mutationFn: () => payOnline(enrollment.id, providerCode, phone, token),
    onSuccess: (result) => setPendingIntent({ id: result.paymentIntentId, message: result.customerMessage }),
  });
  const cancel = useMutation({
    mutationFn: () => cancelEnrollment(enrollment.id, token),
    onSuccess: refresh,
  });

  // Le résultat arrive par le webhook de l'opérateur : on interroge le statut quelques minutes.
  const status = useQuery({
    queryKey: ["remedial-payment-status", pendingIntent?.id],
    queryFn: () => getPaymentStatus(enrollment.id, pendingIntent!.id, token),
    enabled: Boolean(pendingIntent),
    refetchInterval: 5_000,
  });
  useEffect(() => {
    if (status.data && status.data.paymentStatus !== "PENDING") {
      setPendingIntent(null);
      setPaying(false);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data]);

  const confirmed = enrollment.status === "CONFIRMED" || enrollment.status === "COMPLETED";
  const date = (value: string): string => new Date(value).toLocaleDateString(i18n.language);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">
            {enrollment.studentName}
          </p>
          <h3 className="mt-1 font-semibold text-slate-900">{enrollment.offer.title}</h3>
          <p className="text-sm text-slate-500">
            {enrollment.offer.teacher} — {enrollment.offer.schoolName}
            {enrollment.offer.schoolCity ? `, ${enrollment.offer.schoolCity}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {date(enrollment.offer.startsOn)} → {date(enrollment.offer.endsOn)} ·{" "}
            {enrollment.offer.scheduleNote} · {t(`remedial.mode.${enrollment.offer.mode}`)}
            {enrollment.offer.location ? ` · ${enrollment.offer.location}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-slate-900">
            {formatAmount(enrollment.amountCents, enrollment.currency, i18n.language)}
          </p>
          <p className="text-xs text-slate-500">
            {t(`remedial.status.${enrollment.status}`)} · {enrollment.reference}
          </p>
        </div>
      </div>

      {confirmed && enrollment.offer.accessDetails ? (
        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">{t("remedial.portal.accessDetails")}</p>
          <p className="mt-1 whitespace-pre-line">{enrollment.offer.accessDetails}</p>
        </div>
      ) : null}

      {enrollment.status === "PENDING_PAYMENT" ? (
        <div className="mt-3 space-y-3">
          {!paying ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setPaying(true)}>
                {t("remedial.portal.pay")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {t("remedial.portal.cancel")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg bg-slate-50 p-4">
              {pendingIntent ? (
                <p role="status" className="text-sm text-slate-700">
                  {pendingIntent.message ?? t("remedial.portal.confirmOnPhone")}
                </p>
              ) : (
                <>
                  {(options.data?.providers ?? []).length > 0 ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs font-medium text-slate-600">
                        {t("remedial.portal.provider")}
                        <select
                          className="input mt-1 w-52"
                          value={providerCode}
                          onChange={(e) => setProviderCode(e.target.value)}
                        >
                          <option value="">{t("remedial.portal.chooseProvider")}</option>
                          {(options.data?.providers ?? []).map((provider) => (
                            <option key={provider.code} value={provider.code}>
                              {i18n.language.startsWith("en") ? provider.nameEn : provider.nameFr}
                              {provider.isTestMode ? " (test)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        {t("remedial.portal.phone")}
                        <input
                          className="input mt-1 w-48"
                          inputMode="tel"
                          placeholder="+235 66 00 00 00"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!providerCode || !phone || pay.isPending}
                        onClick={() => pay.mutate()}
                      >
                        {t("remedial.portal.payNow")}
                      </Button>
                    </div>
                  ) : options.isSuccess ? (
                    <p className="text-sm text-slate-600">{t("remedial.portal.noOnline")}</p>
                  ) : null}
                  {options.data ? (
                    <p className="text-sm text-slate-600">
                      {t("remedial.portal.cashInstructions", {
                        school: options.data.cash.schoolName,
                        reference: options.data.cash.reference,
                      })}
                    </p>
                  ) : null}
                  {pay.isError ? <p className="text-sm text-red-600">{errorText(pay.error)}</p> : null}
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
