import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  formatMoney,
  getFamilyPaymentOptions,
  getFamilyPaymentStatus,
  getFamilySchedule,
  payFamilyInvoice,
  type FamilySchedule,
} from "../../lib/feesApi.js";

type Due = FamilySchedule["dues"][number];

/**
 * Portail parent : « vous devez X avant le JJ/MM (tranche n) », toutes les
 * échéances de l'année, et le paiement en ligne d'une échéance quand
 * l'établissement l'a activé (sinon, la référence à présenter à la caisse).
 */
export function FamilyFeeSchedule({
  studentId,
  accessToken,
}: {
  studentId: string;
  accessToken: string;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const schedule = useQuery({
    queryKey: ["family-fee-schedule", studentId, accessToken],
    queryFn: () => getFamilySchedule(studentId, accessToken),
    networkMode: "always",
    retry: false,
  });
  const [paying, setPaying] = useState<string | null>(null);
  if (schedule.isPending || schedule.isError) return null;
  const data = schedule.data;
  if (!Array.isArray(data.dues) || data.dues.length === 0) return null;
  const date = (value: string | null): string =>
    value ? new Date(value).toLocaleDateString(i18n.language, { timeZone: "UTC" }) : "—";
  const label = (due: Due): string =>
    due.kind === "REGISTRATION"
      ? t("fees.due.registration")
      : due.kind === "PENALTY"
        ? t("fees.due.penalty")
        : due.label;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{t("fees.family.title")}</h2>
      {data.nextDue ? (
        <p
          className={`mt-3 rounded-lg p-3 text-sm ${data.overdueCents > 0 ? "bg-red-50 text-red-800" : "bg-teal-50 text-teal-900"}`}
        >
          {t(data.overdueCents > 0 ? "fees.family.overdueBanner" : "fees.family.nextBanner", {
            amount: formatMoney(data.nextDue.amountCents),
            date: date(data.nextDue.dueAt),
            label: data.dues.find((due) => due.id === data.nextDue!.id)
              ? label(data.dues.find((due) => due.id === data.nextDue!.id)!)
              : data.nextDue.label,
          })}
        </p>
      ) : (
        <p className="mt-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{t("fees.family.upToDate")}</p>
      )}
      {data.reportCardWithheld ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("fees.family.withheld")}</p>
      ) : null}
      {data.creditCents > 0 ? (
        <p className="mt-3 text-sm text-teal-800">
          {t("fees.family.credit", { amount: formatMoney(data.creditCents) })}
        </p>
      ) : null}

      <ul className="mt-4 space-y-2 text-sm">
        {data.dues.map((due) => (
          <li key={due.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{label(due)}</p>
                <p className={`text-xs ${due.isOverdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                  {t("fees.family.dueOn", { date: date(due.dueAt) })}
                  {due.isOverdue ? ` · ${t("fees.student.late")}` : ""}
                  {due.items.length > 1 ? ` · ${due.items.map((item) => item.description).join(" + ")}` : ""}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-semibold text-slate-900">
                  {formatMoney(due.outstandingCents > 0 ? due.outstandingCents : due.totalCents)}
                </p>
                <p className="text-xs text-slate-500">
                  {due.status === "PAID"
                    ? t("fees.family.paid")
                    : due.paidCents > 0
                      ? t("fees.family.partial", { amount: formatMoney(due.paidCents) })
                      : t("fees.family.toPay")}
                </p>
              </div>
            </div>
            {due.outstandingCents > 0 && due.status !== "CANCELLED" ? (
              paying === due.id ? (
                <PayDue
                  studentId={studentId}
                  due={due}
                  accessToken={accessToken}
                  onDone={() => setPaying(null)}
                />
              ) : (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-brand-teal hover:underline"
                  onClick={() => setPaying(due.id)}
                >
                  {data.onlinePaymentEnabled ? t("fees.family.pay") : t("fees.family.howToPay")}
                </button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PayDue({
  studentId,
  due,
  accessToken,
  onDone,
}: {
  studentId: string;
  due: Due;
  accessToken: string;
  onDone: () => void;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const client = useQueryClient();
  const options = useQuery({
    queryKey: ["family-pay-options", due.id, accessToken],
    queryFn: () => getFamilyPaymentOptions(studentId, due.id, accessToken),
    retry: false,
  });
  const [providerCode, setProviderCode] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<{ id: string; message: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const pay = useMutation({
    mutationFn: () => payFamilyInvoice(studentId, due.id, { providerCode, phone }, accessToken),
    onSuccess: (result) => {
      setFailed(false);
      setPending({ id: result.paymentIntentId, message: result.customerMessage });
    },
  });
  const status = useQuery({
    queryKey: ["family-pay-status", pending?.id],
    queryFn: () => getFamilyPaymentStatus(studentId, due.id, pending!.id, accessToken),
    enabled: Boolean(pending),
    refetchInterval: 5_000,
  });
  useEffect(() => {
    if (status.data && status.data.paymentStatus !== "PENDING") {
      void client.invalidateQueries({ queryKey: ["family-fee-schedule", studentId] });
      void client.invalidateQueries({ queryKey: ["child-finance", studentId] });
      void client.invalidateQueries({ queryKey: ["child-receipts", studentId] });
      setPending(null);
      if (status.data.paymentStatus === "SUCCEEDED") onDone();
      else setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data]);

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
      {pending ? (
        <p role="status" className="text-sm text-slate-700">
          {pending.message ?? t("fees.family.confirmOnPhone")}
        </p>
      ) : (
        <>
          {(options.data?.providers ?? []).length > 0 ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-slate-600">
                {t("fees.family.provider")}
                <select
                  className="input mt-1 block w-52"
                  value={providerCode}
                  onChange={(e) => setProviderCode(e.target.value)}
                >
                  <option value="">{t("fees.choose")}</option>
                  {(options.data?.providers ?? []).map((provider) => (
                    <option key={provider.code} value={provider.code}>
                      {i18n.language.startsWith("en") ? provider.nameEn : provider.nameFr}
                      {provider.isTestMode ? " (test)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                {t("fees.family.phone")}
                <input
                  className="input mt-1 block w-48"
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
                {t("fees.family.payNow", { amount: formatMoney(options.data!.amountCents) })}
              </Button>
            </div>
          ) : null}
          {options.data ? (
            <p className="text-xs text-slate-600">
              {t("fees.family.cash", {
                school: options.data.cash.schoolName,
                reference: options.data.cash.reference,
              })}
            </p>
          ) : null}
          {pay.isError ? (
            <p className="text-sm text-red-600">{pay.error instanceof Error ? pay.error.message : ""}</p>
          ) : null}
          {failed ? <p className="text-sm text-red-600">{t("fees.family.failed")}</p> : null}
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={onDone}>
            {t("fees.cancel")}
          </button>
        </>
      )}
    </div>
  );
}
