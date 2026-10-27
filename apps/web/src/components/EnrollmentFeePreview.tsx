import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TenantCredentials } from "../lib/apiClient.js";
import {
  formatMoney,
  getFeeMode,
  listEnrollmentDiscountPresets,
  previewEnrollment,
  toCents,
  type EnrollmentRequest,
  type EnrollmentFeeChoices,
  type ManualDiscount,
} from "../lib/feesApi.js";

/**
 * Avant de valider une inscription : options (cantine, transport…), remises et
 * aperçu de l'échéancier exact (inscription, tranches, dates). Rien n'est écrit.
 */
export function EnrollmentFeePreview({
  studentId,
  base,
  creds,
  canGrantManualDiscount,
  value,
  onChange,
}: {
  studentId: string;
  base: Omit<EnrollmentRequest, "optionalFeeStructureIds" | "discountPresetIds" | "manualDiscounts"> | null;
  creds: TenantCredentials;
  canGrantManualDiscount: boolean;
  value: EnrollmentFeeChoices;
  onChange: (value: EnrollmentFeeChoices) => void;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const mode = useQuery({
    queryKey: ["fee-mode", creds.subdomain, base?.academicYearId],
    queryFn: () => getFeeMode(base!.academicYearId, creds),
    enabled: Boolean(base?.academicYearId),
  });
  const presets = useQuery({
    queryKey: ["enrollment-discount-presets", creds.subdomain],
    queryFn: () => listEnrollmentDiscountPresets(creds),
    enabled: Boolean(mode.data?.usesPlans),
  });
  const [manual, setManual] = useState({
    open: false,
    label: "",
    kind: "AMOUNT" as "AMOUNT" | "PERCENT",
    value: "",
    reason: "",
  });
  useEffect(() => {
    if (!manual.open) {
      if (value.manualDiscounts.length) onChange({ ...value, manualDiscounts: [] });
      return;
    }
    const amount = Number(manual.value);
    const ready = manual.label.trim() && amount > 0 && manual.reason.trim().length >= 3;
    const next: ManualDiscount[] = ready
      ? [
          {
            label: manual.label.trim(),
            kind: manual.kind,
            value: manual.kind === "PERCENT" ? Math.round(amount * 100) : toCents(amount),
            reason: manual.reason.trim(),
          },
        ]
      : [];
    if (JSON.stringify(next) !== JSON.stringify(value.manualDiscounts))
      onChange({ ...value, manualDiscounts: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual]);
  const request: EnrollmentRequest | null = base
    ? {
        ...base,
        optionalFeeStructureIds: value.optionalFeeStructureIds,
        discountPresetIds: value.discountPresetIds,
        ...(value.manualDiscounts.length ? { manualDiscounts: value.manualDiscounts } : {}),
      }
    : null;
  const preview = useQuery({
    queryKey: ["enrollment-preview", creds.subdomain, studentId, request],
    queryFn: () => previewEnrollment(studentId, request!, creds),
    enabled: Boolean(studentId && request && mode.data?.usesPlans),
  });
  if (!base || !studentId || !mode.data) return null;
  if (!mode.data.usesPlans) return null;
  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  const date = (value: string): string =>
    new Date(value).toLocaleDateString(i18n.language, { timeZone: "UTC" });

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      {preview.data && preview.data.optionalChoices.length > 0 ? (
        <fieldset>
          <legend className="font-medium text-slate-800">{t("fees.enroll.options")}</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {preview.data.optionalChoices.map((choice) => (
              <label key={choice.feeStructureId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.optionalFeeStructureIds.includes(choice.feeStructureId)}
                  onChange={() =>
                    onChange({
                      ...value,
                      optionalFeeStructureIds: toggle(value.optionalFeeStructureIds, choice.feeStructureId),
                    })
                  }
                />
                {choice.label} ({formatMoney(choice.amountCents)})
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {(presets.data ?? []).length > 0 ? (
        <fieldset>
          <legend className="font-medium text-slate-800">{t("fees.enroll.discounts")}</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {(presets.data ?? []).map((preset) => (
              <label key={preset.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.discountPresetIds.includes(preset.id)}
                  onChange={() =>
                    onChange({ ...value, discountPresetIds: toggle(value.discountPresetIds, preset.id) })
                  }
                />
                {preset.name} (
                {preset.kind === "PERCENT" ? `${preset.value / 100} %` : formatMoney(preset.value)})
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {canGrantManualDiscount ? (
        <div>
          <label className="flex items-center gap-2 font-medium text-slate-800">
            <input
              type="checkbox"
              checked={manual.open}
              onChange={(e) => setManual({ ...manual, open: e.target.checked })}
            />
            {t("fees.enroll.manual")}
          </label>
          {manual.open ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                className="input w-44"
                placeholder={t("fees.enroll.manualLabel")}
                value={manual.label}
                onChange={(e) => setManual({ ...manual, label: e.target.value })}
              />
              <select
                className="input w-32"
                value={manual.kind}
                onChange={(e) => setManual({ ...manual, kind: e.target.value as "AMOUNT" | "PERCENT" })}
              >
                <option value="AMOUNT">FCFA</option>
                <option value="PERCENT">%</option>
              </select>
              <input
                className="input w-28"
                type="number"
                min="1"
                value={manual.value}
                onChange={(e) => setManual({ ...manual, value: e.target.value })}
              />
              <input
                className="input w-72"
                placeholder={t("fees.enroll.manualReason")}
                value={manual.reason}
                onChange={(e) => setManual({ ...manual, reason: e.target.value })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {preview.isError ? (
        <p className="text-red-600">{preview.error instanceof Error ? preview.error.message : ""}</p>
      ) : null}
      {preview.data ? (
        <div>
          <p className="font-medium text-slate-800">
            {t("fees.enroll.previewTitle", { plan: preview.data.planName ?? "—" })} ·{" "}
            {preview.data.isReturning ? t("fees.profile.RETURNING") : t("fees.profile.NEW")}
          </p>
          <table className="mt-2 w-full max-w-2xl text-left">
            <tbody>
              {preview.data.dues.map((due, index) => (
                <tr key={index} className="border-b border-slate-200 last:border-0">
                  <td className="py-1 pr-4">
                    {due.kind === "REGISTRATION" ? t("fees.due.registration") : due.label}
                    {due.items.length > 1 ? (
                      <span className="block text-xs text-slate-500">
                        {due.items.map((item) => item.label).join(" + ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-4 text-slate-600">{date(due.dueDate)}</td>
                  <td className="py-1 text-right font-medium">{formatMoney(due.totalCents)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-semibold" colSpan={2}>
                  {t("fees.enroll.total")}
                  {preview.data.discountCents > 0 ? (
                    <span className="ml-2 text-xs font-normal text-teal-700">
                      {t("fees.enroll.discountApplied", { amount: formatMoney(preview.data.discountCents) })}
                    </span>
                  ) : null}
                </td>
                <td className="pt-2 text-right font-semibold">{formatMoney(preview.data.totalCents)}</td>
              </tr>
            </tbody>
          </table>
          {preview.data.groupedSequences.length > 0 ? (
            <p className="mt-2 text-xs text-amber-700">{t("fees.enroll.grouped")}</p>
          ) : null}
          {preview.data.skippedSequences.length > 0 ? (
            <p className="mt-2 text-xs text-amber-700">{t("fees.enroll.prorata")}</p>
          ) : null}
          {preview.data.registrationCents > 0 ? (
            <p className="mt-2 text-xs text-slate-600">{t("fees.enroll.gate")}</p>
          ) : null}
          {preview.data.arrearsCents > 0 ? (
            <p
              className={`mt-2 text-xs ${preview.data.reenrollmentBlocked ? "font-medium text-red-600" : "text-amber-700"}`}
            >
              {t(preview.data.reenrollmentBlocked ? "fees.enroll.arrearsBlocked" : "fees.enroll.arrears", {
                amount: formatMoney(preview.data.arrearsCents),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
