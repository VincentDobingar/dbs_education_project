import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { TenantCredentials } from "../../lib/apiClient.js";
import {
  copyFeeSetup,
  createDiscountPreset,
  createFeeCategory,
  createFeeStructure,
  deleteFeePlan,
  deleteFeeStructure,
  formatMoney,
  getFeePolicy,
  getRecovery,
  listDiscountPresets,
  listFeeCategories,
  listFeePlans,
  listFeeStructures,
  saveFeePlan,
  saveFeePolicy,
  toCents,
  updateDiscountPreset,
  type FeeAnchorType,
  type FeeNature,
  type FeePlan,
  type FeePlanInstallment,
  type FeePolicy,
  type FeeStudentType,
  type RecoveryBucket,
} from "../../lib/feesApi.js";
import {
  listAcademicPeriods,
  listAcademicYears,
  listEducationCycles,
  listGradeLevels,
  type AcademicPeriod,
} from "../../lib/schoolConfigApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

type Tab = "fees" | "plans" | "discounts" | "rules" | "recovery";
const NATURES: FeeNature[] = ["REGISTRATION", "TUITION", "ANNEX", "EXAM"];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Paramétrage annuel des frais scolaires : rubriques, grille par niveau, plans
 * d'échéances calés sur les trimestres ou semestres, remises, règles (retards,
 * relances, retenue de bulletin) et tableau de recouvrement.
 */
export function FeeSetupPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const canWrite = session.roleCodes.some((role) => ["SCHOOL_OWNER", "ACCOUNTANT"].includes(role));
  const [tab, setTab] = useState<Tab>("fees");
  const years = useQuery({
    queryKey: ["academic-years", session.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const [yearId, setYearId] = useState("");
  useEffect(() => {
    if (!yearId && years.data?.length) {
      setYearId((years.data.find((year) => year.isCurrent) ?? years.data[0]!).id);
    }
  }, [years.data, yearId]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("fees.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{t("fees.subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium text-slate-700">
          {t("fees.year")}
          <select className="input ml-2" value={yearId} onChange={(event) => setYearId(event.target.value)}>
            {(years.data ?? []).map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2" role="tablist">
          {(["fees", "plans", "discounts", "rules", "recovery"] as const).map((key) => (
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
              {t(`fees.tab.${key}`)}
            </button>
          ))}
        </div>
      </div>
      {years.data?.length === 0 ? (
        <p className="text-sm text-slate-600">
          {t("fees.noYear")}{" "}
          <Link className="underline" to="/configuration">
            {t("layout.nav.configuration")}
          </Link>
        </p>
      ) : null}
      {yearId && tab === "fees" ? (
        <FeesTab yearId={yearId} creds={creds} canWrite={canWrite} years={years.data ?? []} />
      ) : null}
      {yearId && tab === "plans" ? <PlansTab yearId={yearId} creds={creds} canWrite={canWrite} /> : null}
      {tab === "discounts" ? <DiscountsTab creds={creds} canWrite={canWrite} /> : null}
      {tab === "rules" ? <RulesTab creds={creds} canWrite={canWrite} /> : null}
      {yearId && tab === "recovery" ? <RecoveryTab yearId={yearId} creds={creds} /> : null}
    </main>
  );
}

function Card({ title, children, hint }: { title: string; hint?: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ rubriques et grille

function FeesTab({
  yearId,
  creds,
  canWrite,
  years,
}: {
  yearId: string;
  creds: TenantCredentials;
  canWrite: boolean;
  years: { id: string; name: string }[];
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const client = useQueryClient();
  const isEn = i18n.language.startsWith("en");
  const categories = useQuery({
    queryKey: ["fee-categories", creds.subdomain],
    queryFn: () => listFeeCategories(creds),
  });
  const levels = useQuery({
    queryKey: ["grade-levels", creds.subdomain],
    queryFn: () => listGradeLevels(creds),
  });
  const structures = useQuery({
    queryKey: ["fee-structures", creds.subdomain, yearId],
    queryFn: () => listFeeStructures(yearId, creds),
  });
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["fee-categories", creds.subdomain] });
    void client.invalidateQueries({ queryKey: ["fee-structures", creds.subdomain] });
  };
  const [category, setCategory] = useState({
    code: "",
    nameFr: "",
    nameEn: "",
    nature: "TUITION" as FeeNature,
  });
  const addCategory = useMutation({
    mutationFn: () => createFeeCategory({ ...category, nameEn: category.nameEn || category.nameFr }, creds),
    onSuccess: () => {
      setCategory({ code: "", nameFr: "", nameEn: "", nature: "TUITION" });
      refresh();
    },
  });
  const [line, setLine] = useState({
    feeCategoryId: "",
    gradeLevelId: "",
    studentType: "ALL" as FeeStudentType,
    amount: "",
    optional: false,
    tranche: "1",
  });
  const chosenCategory = categories.data?.find((row) => row.id === line.feeCategoryId);
  const addLine = useMutation({
    mutationFn: () =>
      createFeeStructure(
        {
          academicYearId: yearId,
          feeCategoryId: line.feeCategoryId,
          amountCents: toCents(line.amount),
          ...(line.gradeLevelId ? { gradeLevelId: line.gradeLevelId } : {}),
          studentType: line.studentType,
          isMandatory: !line.optional,
          ...(chosenCategory && (chosenCategory.nature === "ANNEX" || chosenCategory.nature === "EXAM")
            ? { dueWithInstallment: Number(line.tranche) }
            : {}),
        },
        creds,
      ),
    onSuccess: () => {
      setLine((current) => ({ ...current, amount: "" }));
      refresh();
    },
  });
  const removeLine = useMutation({
    mutationFn: (id: string) => deleteFeeStructure(id, creds),
    onSuccess: refresh,
  });
  const [copyFrom, setCopyFrom] = useState("");
  const copy = useMutation({
    mutationFn: () => copyFeeSetup({ fromAcademicYearId: copyFrom, toAcademicYearId: yearId }, creds),
    onSuccess: () => {
      refresh();
      void client.invalidateQueries({ queryKey: ["fee-plans", creds.subdomain] });
    },
  });
  const levelName = (id: string | null): string => {
    if (!id) return t("fees.grid.allLevels");
    const level = levels.data?.find((row) => row.id === id);
    return level ? (isEn ? level.nameEn : level.nameFr) : "—";
  };
  const rows = [...(structures.data ?? [])].sort(
    (a, b) => NATURES.indexOf(a.feeCategory.nature) - NATURES.indexOf(b.feeCategory.nature),
  );

  return (
    <div className="space-y-6">
      <Card title={t("fees.categories.title")} hint={t("fees.categories.hint")}>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(categories.data ?? []).map((row) => (
            <li key={row.id} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              <strong>{isEn ? row.nameEn : row.nameFr}</strong> · {t(`fees.nature.${row.nature}`)}
              {!row.isRefundable ? ` · ${t("fees.categories.nonRefundable")}` : ""}
            </li>
          ))}
          {categories.data?.length === 0 ? (
            <li className="text-slate-500">{t("fees.categories.empty")}</li>
          ) : null}
        </ul>
        {canWrite ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              addCategory.mutate();
            }}
          >
            <label className="text-xs font-medium text-slate-600">
              {t("fees.categories.code")}
              <input
                className="input mt-1 block w-28"
                required
                maxLength={40}
                value={category.code}
                onChange={(e) => setCategory({ ...category, code: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("fees.categories.nameFr")}
              <input
                className="input mt-1 block w-48"
                required
                value={category.nameFr}
                onChange={(e) => setCategory({ ...category, nameFr: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("fees.categories.nameEn")}
              <input
                className="input mt-1 block w-44"
                value={category.nameEn}
                onChange={(e) => setCategory({ ...category, nameEn: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("fees.categories.nature")}
              <select
                className="input mt-1 block w-48"
                value={category.nature}
                onChange={(e) => setCategory({ ...category, nature: e.target.value as FeeNature })}
              >
                {NATURES.map((nature) => (
                  <option key={nature} value={nature}>
                    {t(`fees.nature.${nature}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary" disabled={addCategory.isPending}>
              {t("fees.add")}
            </Button>
            {addCategory.isError ? (
              <p className="w-full text-sm text-red-600">{errorText(addCategory.error)}</p>
            ) : null}
          </form>
        ) : null}
      </Card>

      <Card title={t("fees.grid.title")} hint={t("fees.grid.hint")}>
        {rows.length === 0 ? <p className="text-sm text-slate-500">{t("fees.grid.empty")}</p> : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("fees.grid.category")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("fees.grid.level")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("fees.grid.profile")}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t("fees.grid.amount")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("fees.grid.billing")}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4">
                      {isEn ? row.feeCategory.nameEn : row.feeCategory.nameFr}
                      <span className="ml-2 text-xs text-slate-500">
                        {t(`fees.nature.${row.feeCategory.nature}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{levelName(row.gradeLevelId)}</td>
                    <td className="py-2 pr-4">{t(`fees.profile.${row.studentType}`)}</td>
                    <td className="py-2 pr-4 text-right font-medium">{formatMoney(row.amountCents)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {row.feeCategory.nature === "REGISTRATION"
                        ? t("fees.grid.atEnrollment")
                        : row.feeCategory.nature === "TUITION"
                          ? t("fees.grid.splitByPlan")
                          : t("fees.grid.withTranche", { n: row.dueWithInstallment ?? 1 })}
                      {!row.isMandatory ? ` · ${t("fees.grid.optional")}` : ""}
                    </td>
                    <td className="py-2 text-right">
                      {canWrite ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeLine.mutate(row.id)}
                        >
                          {t("fees.remove")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {canWrite ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              addLine.mutate();
            }}
          >
            <label className="text-xs font-medium text-slate-600">
              {t("fees.grid.category")}
              <select
                className="input mt-1 block w-52"
                required
                value={line.feeCategoryId}
                onChange={(e) => setLine({ ...line, feeCategoryId: e.target.value })}
              >
                <option value="">{t("fees.choose")}</option>
                {(categories.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {isEn ? row.nameEn : row.nameFr}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("fees.grid.level")}
              <select
                className="input mt-1 block w-44"
                value={line.gradeLevelId}
                onChange={(e) => setLine({ ...line, gradeLevelId: e.target.value })}
              >
                <option value="">{t("fees.grid.allLevels")}</option>
                {(levels.data ?? []).map((level) => (
                  <option key={level.id} value={level.id}>
                    {isEn ? level.nameEn : level.nameFr}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("fees.grid.profile")}
              <select
                className="input mt-1 block w-40"
                value={line.studentType}
                onChange={(e) => setLine({ ...line, studentType: e.target.value as FeeStudentType })}
              >
                {(["ALL", "NEW", "RETURNING"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`fees.profile.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("fees.grid.amountFcfa")}
              <input
                className="input mt-1 block w-36"
                type="number"
                min="1"
                step="1"
                required
                value={line.amount}
                onChange={(e) => setLine({ ...line, amount: e.target.value })}
              />
            </label>
            {chosenCategory && (chosenCategory.nature === "ANNEX" || chosenCategory.nature === "EXAM") ? (
              <label className="text-xs font-medium text-slate-600">
                {t("fees.grid.tranche")}
                <input
                  className="input mt-1 block w-20"
                  type="number"
                  min="1"
                  max="12"
                  value={line.tranche}
                  onChange={(e) => setLine({ ...line, tranche: e.target.value })}
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={line.optional}
                onChange={(e) => setLine({ ...line, optional: e.target.checked })}
              />
              {t("fees.grid.optionalLabel")}
            </label>
            <Button type="submit" variant="secondary" disabled={addLine.isPending}>
              {t("fees.add")}
            </Button>
            {addLine.isError ? (
              <p className="w-full text-sm text-red-600">{errorText(addLine.error)}</p>
            ) : null}
          </form>
        ) : null}
        {canWrite && years.length > 1 ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <label className="text-xs font-medium text-slate-600">
              {t("fees.copy.from")}
              <select
                className="input mt-1 block w-44"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
              >
                <option value="">{t("fees.choose")}</option>
                {years
                  .filter((year) => year.id !== yearId)
                  .map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              type="button"
              variant="primary"
              disabled={!copyFrom || copy.isPending}
              onClick={() => copy.mutate()}
            >
              {t("fees.copy.action")}
            </Button>
            {copy.isSuccess ? (
              <p className="text-sm text-teal-700">
                {t("fees.copy.done", { plans: copy.data.plans, fees: copy.data.feeStructures })}
              </p>
            ) : null}
            {copy.isError ? <p className="text-sm text-red-600">{errorText(copy.error)}</p> : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ plans

interface DraftInstallment {
  label: string;
  percent: string;
  anchorType: FeeAnchorType;
  academicPeriodId: string;
  offsetDays: string;
  fixedDate: string;
}

function toDraft(installment: FeePlanInstallment): DraftInstallment {
  return {
    label: installment.label,
    percent: String(installment.shareBps / 100),
    anchorType: installment.anchorType,
    academicPeriodId: installment.academicPeriodId ?? "",
    offsetDays: String(installment.offsetDays),
    fixedDate: installment.fixedDate ? installment.fixedDate.slice(0, 10) : "",
  };
}

function splitPercents(count: number): string[] {
  const base = Math.floor(10_000 / count);
  return Array.from({ length: count }, (_, index) =>
    String((index === count - 1 ? 10_000 - base * (count - 1) : base) / 100),
  );
}

function templateRows(
  kind: "terms" | "semesters" | "four" | "monthly",
  periods: AcademicPeriod[],
  t: TFunction<"app">,
): DraftInstallment[] {
  const sorted = [...periods].sort((a, b) => a.sequence - b.sequence);
  const row = (label: string, percent: string, period?: AcademicPeriod, offset = 0): DraftInstallment => ({
    label,
    percent,
    anchorType: period ? "PERIOD_START" : "ENROLLMENT",
    academicPeriodId: period?.id ?? "",
    offsetDays: String(offset),
    fixedDate: "",
  });
  if (kind === "terms") {
    return [
      row(t("fees.plans.trancheN", { n: 1 }), "50"),
      row(t("fees.plans.trancheN", { n: 2 }), "30", sorted[1], 15),
      row(t("fees.plans.trancheN", { n: 3 }), "20", sorted[2], 15),
    ];
  }
  if (kind === "semesters") {
    return [
      row(t("fees.plans.trancheN", { n: 1 }), "50"),
      row(t("fees.plans.trancheN", { n: 2 }), "50", sorted[1], 0),
    ];
  }
  if (kind === "four") {
    return [
      row(t("fees.plans.trancheN", { n: 1 }), "25"),
      row(t("fees.plans.trancheN", { n: 2 }), "25", sorted[0], 45),
      row(t("fees.plans.trancheN", { n: 3 }), "25", sorted[1], 0),
      row(t("fees.plans.trancheN", { n: 4 }), "25", sorted[2], 0),
    ];
  }
  const percents = splitPercents(10);
  return percents.map((percent, index) => ({
    ...row(t("fees.plans.monthN", { n: index + 1 }), percent),
    anchorType: "ENROLLMENT" as const,
    offsetDays: String(index * 30),
  }));
}

function PlansTab({
  yearId,
  creds,
  canWrite,
}: {
  yearId: string;
  creds: TenantCredentials;
  canWrite: boolean;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const client = useQueryClient();
  const isEn = i18n.language.startsWith("en");
  const plans = useQuery({
    queryKey: ["fee-plans", creds.subdomain, yearId],
    queryFn: () => listFeePlans(yearId, creds),
  });
  const periods = useQuery({
    queryKey: ["academic-periods", creds.subdomain, yearId],
    queryFn: () => listAcademicPeriods(yearId, creds),
  });
  const cycles = useQuery({
    queryKey: ["education-cycles", creds.subdomain],
    queryFn: () => listEducationCycles(creds),
  });
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    educationCycleId: string;
    rows: DraftInstallment[];
  } | null>(null);
  const refresh = (): void => void client.invalidateQueries({ queryKey: ["fee-plans", creds.subdomain] });
  const save = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("no plan");
      return saveFeePlan(
        {
          academicYearId: yearId,
          educationCycleId: editing.educationCycleId || null,
          name: editing.name,
          installments: editing.rows.map((row) => ({
            label: row.label,
            shareBps: Math.round(Number(row.percent) * 100),
            anchorType: row.anchorType,
            academicPeriodId: row.anchorType === "PERIOD_START" ? row.academicPeriodId : null,
            offsetDays: Number(row.offsetDays || 0),
            fixedDate:
              row.anchorType === "FIXED_DATE" && row.fixedDate ? `${row.fixedDate}T00:00:00.000Z` : null,
          })),
        },
        creds,
        editing.id,
      );
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteFeePlan(id, creds), onSuccess: refresh });
  const total = editing
    ? editing.rows.reduce((sum, row) => sum + Math.round(Number(row.percent || 0) * 100), 0)
    : 0;
  const periodName = (id: string | null): string =>
    periods.data?.find((period) => period.id === id)?.name ?? "—";
  const anchorText = (installment: FeePlanInstallment): string => {
    if (installment.anchorType === "ENROLLMENT") {
      return installment.offsetDays
        ? t("fees.plans.anchorEnrollmentOffset", { days: installment.offsetDays })
        : t("fees.plans.anchorEnrollment");
    }
    if (installment.anchorType === "FIXED_DATE") return installment.fixedDate?.slice(0, 10) ?? "—";
    return installment.offsetDays
      ? t("fees.plans.anchorPeriodOffset", {
          period: periodName(installment.academicPeriodId),
          days: installment.offsetDays,
        })
      : t("fees.plans.anchorPeriod", { period: periodName(installment.academicPeriodId) });
  };
  const usedCycles = new Set(
    (plans.data ?? []).filter((plan) => plan.id !== editing?.id).map((plan) => plan.educationCycleId ?? ""),
  );

  return (
    <div className="space-y-6">
      <Card title={t("fees.plans.title")} hint={t("fees.plans.hint")}>
        {(plans.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("fees.plans.empty")}</p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {(plans.data ?? []).map((plan: FeePlan) => (
            <article key={plan.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                  <p className="text-xs text-slate-500">
                    {plan.educationCycleId
                      ? t("fees.plans.forCycle", {
                          cycle: (() => {
                            const cycle = cycles.data?.find((row) => row.id === plan.educationCycleId);
                            return cycle ? (isEn ? cycle.nameEn : cycle.nameFr) : "—";
                          })(),
                        })
                      : t("fees.plans.general")}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-brand-teal hover:underline"
                      onClick={() =>
                        setEditing({
                          id: plan.id,
                          name: plan.name,
                          educationCycleId: plan.educationCycleId ?? "",
                          rows: plan.installments.map(toDraft),
                        })
                      }
                    >
                      {t("fees.edit")}
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => remove.mutate(plan.id)}
                    >
                      {t("fees.remove")}
                    </button>
                  </div>
                ) : null}
              </div>
              <ol className="mt-3 space-y-1 text-sm">
                {plan.installments.map((installment) => (
                  <li
                    key={installment.id ?? installment.sequence}
                    className="flex justify-between gap-3 border-b border-slate-100 pb-1 last:border-0"
                  >
                    <span>
                      {installment.label} · <span className="text-slate-500">{anchorText(installment)}</span>
                    </span>
                    <strong>{installment.shareBps / 100} %</strong>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
        {remove.isError ? <p className="mt-2 text-sm text-red-600">{errorText(remove.error)}</p> : null}
        {canWrite && !editing ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {(["terms", "four", "semesters", "monthly"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="primary"
                onClick={() =>
                  setEditing({
                    name: t(`fees.plans.template.${kind}`),
                    educationCycleId: "",
                    rows: templateRows(kind, periods.data ?? [], t),
                  })
                }
              >
                {t(`fees.plans.template.${kind}`)}
              </Button>
            ))}
          </div>
        ) : null}
        {(periods.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-amber-700">{t("fees.plans.noPeriods")}</p>
        ) : null}
      </Card>

      {editing ? (
        <Card title={editing.id ? t("fees.plans.editTitle") : t("fees.plans.newTitle")}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex flex-wrap gap-3">
              <label className="text-xs font-medium text-slate-600">
                {t("fees.plans.name")}
                <input
                  className="input mt-1 block w-64"
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                {t("fees.plans.appliesTo")}
                <select
                  className="input mt-1 block w-64"
                  value={editing.educationCycleId}
                  onChange={(e) => setEditing({ ...editing, educationCycleId: e.target.value })}
                >
                  <option value="" disabled={usedCycles.has("")}>
                    {t("fees.plans.general")}
                  </option>
                  {(cycles.data ?? []).map((cycle) => (
                    <option key={cycle.id} value={cycle.id} disabled={usedCycles.has(cycle.id)}>
                      {isEn ? cycle.nameEn : cycle.nameFr}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="pb-2 pr-3 font-medium">{t("fees.plans.label")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("fees.plans.share")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("fees.plans.due")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("fees.plans.periodOrDate")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("fees.plans.offset")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {editing.rows.map((row, index) => {
                    const update = (patch: Partial<DraftInstallment>): void =>
                      setEditing({
                        ...editing,
                        rows: editing.rows.map((item, i) => (i === index ? { ...item, ...patch } : item)),
                      });
                    return (
                      <tr key={index}>
                        <td className="py-1 pr-3">
                          <input
                            className="input w-36"
                            required
                            value={row.label}
                            onChange={(e) => update({ label: e.target.value })}
                          />
                        </td>
                        <td className="py-1 pr-3">
                          <input
                            className="input w-20"
                            type="number"
                            min="0.01"
                            max="100"
                            step="0.01"
                            required
                            value={row.percent}
                            onChange={(e) => update({ percent: e.target.value })}
                          />
                        </td>
                        <td className="py-1 pr-3">
                          <select
                            className="input w-52"
                            value={row.anchorType}
                            onChange={(e) => update({ anchorType: e.target.value as FeeAnchorType })}
                          >
                            <option value="ENROLLMENT">{t("fees.plans.anchor.ENROLLMENT")}</option>
                            <option value="PERIOD_START">{t("fees.plans.anchor.PERIOD_START")}</option>
                            <option value="FIXED_DATE">{t("fees.plans.anchor.FIXED_DATE")}</option>
                          </select>
                        </td>
                        <td className="py-1 pr-3">
                          {row.anchorType === "PERIOD_START" ? (
                            <select
                              className="input w-40"
                              required
                              value={row.academicPeriodId}
                              onChange={(e) => update({ academicPeriodId: e.target.value })}
                            >
                              <option value="">{t("fees.choose")}</option>
                              {(periods.data ?? []).map((period) => (
                                <option key={period.id} value={period.id}>
                                  {period.name}
                                </option>
                              ))}
                            </select>
                          ) : row.anchorType === "FIXED_DATE" ? (
                            <input
                              className="input w-40"
                              type="date"
                              required
                              value={row.fixedDate}
                              onChange={(e) => update({ fixedDate: e.target.value })}
                            />
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-1 pr-3">
                          <input
                            className="input w-20"
                            type="number"
                            min="-60"
                            max="180"
                            value={row.offsetDays}
                            onChange={(e) => update({ offsetDays: e.target.value })}
                          />
                        </td>
                        <td className="py-1">
                          {editing.rows.length > 1 ? (
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:underline"
                              onClick={() =>
                                setEditing({ ...editing, rows: editing.rows.filter((_, i) => i !== index) })
                              }
                            >
                              {t("fees.remove")}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {editing.rows.length < 12 ? (
                <button
                  type="button"
                  className="text-sm text-brand-teal hover:underline"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      rows: [
                        ...editing.rows,
                        {
                          label: t("fees.plans.trancheN", { n: editing.rows.length + 1 }),
                          percent: "0",
                          anchorType: "ENROLLMENT",
                          academicPeriodId: "",
                          offsetDays: "0",
                          fixedDate: "",
                        },
                      ],
                    })
                  }
                >
                  + {t("fees.plans.addTranche")}
                </button>
              ) : null}
              <button
                type="button"
                className="text-sm text-slate-600 hover:underline"
                onClick={() => {
                  const percents = splitPercents(editing.rows.length);
                  setEditing({
                    ...editing,
                    rows: editing.rows.map((row, index) => ({ ...row, percent: percents[index]! })),
                  });
                }}
              >
                {t("fees.plans.evenSplit")}
              </button>
              <span className={`text-sm font-medium ${total === 10_000 ? "text-teal-700" : "text-red-600"}`}>
                {t("fees.plans.total", { value: total / 100 })}
              </span>
            </div>
            <p className="text-xs text-slate-500">{t("fees.plans.editorHint")}</p>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" disabled={save.isPending || total !== 10_000}>
                {t("fees.save")}
              </Button>
              <Button type="button" variant="primary" onClick={() => setEditing(null)}>
                {t("fees.cancel")}
              </Button>
            </div>
            {save.isError ? <p className="text-sm text-red-600">{errorText(save.error)}</p> : null}
          </form>
        </Card>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ remises

function DiscountsTab({ creds, canWrite }: { creds: TenantCredentials; canWrite: boolean }): ReactNode {
  const { t } = useTranslation("app");
  const client = useQueryClient();
  const presets = useQuery({
    queryKey: ["discount-presets", creds.subdomain],
    queryFn: () => listDiscountPresets(creds),
  });
  const refresh = (): void =>
    void client.invalidateQueries({ queryKey: ["discount-presets", creds.subdomain] });
  const [form, setForm] = useState({ name: "", kind: "PERCENT" as "PERCENT" | "AMOUNT", value: "" });
  const create = useMutation({
    mutationFn: () =>
      createDiscountPreset(
        {
          name: form.name,
          kind: form.kind,
          value: form.kind === "PERCENT" ? Math.round(Number(form.value) * 100) : toCents(form.value),
        },
        creds,
      ),
    onSuccess: () => {
      setForm({ name: "", kind: "PERCENT", value: "" });
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateDiscountPreset(id, { isActive }, creds),
    onSuccess: refresh,
  });
  return (
    <Card title={t("fees.discounts.title")} hint={t("fees.discounts.hint")}>
      <ul className="space-y-2 text-sm">
        {(presets.data ?? []).map((preset) => (
          <li
            key={preset.id}
            className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"
          >
            <span className={preset.isActive ? "" : "text-slate-400 line-through"}>
              <strong>{preset.name}</strong> ·{" "}
              {preset.kind === "PERCENT" ? `${preset.value / 100} %` : formatMoney(preset.value)}
            </span>
            {canWrite ? (
              <button
                type="button"
                className="text-xs text-brand-teal hover:underline"
                onClick={() => toggle.mutate({ id: preset.id, isActive: !preset.isActive })}
              >
                {preset.isActive ? t("fees.discounts.disable") : t("fees.discounts.enable")}
              </button>
            ) : null}
          </li>
        ))}
        {presets.data?.length === 0 ? <li className="text-slate-500">{t("fees.discounts.empty")}</li> : null}
      </ul>
      {canWrite ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label className="text-xs font-medium text-slate-600">
            {t("fees.discounts.name")}
            <input
              className="input mt-1 block w-52"
              required
              placeholder={t("fees.discounts.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            {t("fees.discounts.kind")}
            <select
              className="input mt-1 block w-40"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "PERCENT" | "AMOUNT" })}
            >
              <option value="PERCENT">{t("fees.discounts.percent")}</option>
              <option value="AMOUNT">{t("fees.discounts.amount")}</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            {form.kind === "PERCENT" ? "%" : "FCFA"}
            <input
              className="input mt-1 block w-28"
              type="number"
              min="0.01"
              step="0.01"
              max={form.kind === "PERCENT" ? 100 : undefined}
              required
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={create.isPending}>
            {t("fees.add")}
          </Button>
          {create.isError ? <p className="w-full text-sm text-red-600">{errorText(create.error)}</p> : null}
        </form>
      ) : null}
      <p className="mt-4 text-xs text-slate-500">{t("fees.discounts.manualHint")}</p>
    </Card>
  );
}

// ------------------------------------------------------------------ règles

function RulesTab({ creds, canWrite }: { creds: TenantCredentials; canWrite: boolean }): ReactNode {
  const { t } = useTranslation("app");
  const client = useQueryClient();
  const policy = useQuery({ queryKey: ["fee-policy", creds.subdomain], queryFn: () => getFeePolicy(creds) });
  const [draft, setDraft] = useState<FeePolicy | null>(null);
  useEffect(() => {
    if (policy.data && !draft) setDraft(policy.data);
  }, [policy.data, draft]);
  const save = useMutation({
    mutationFn: () => saveFeePolicy(draft!, creds),
    onSuccess: (data) => {
      setDraft(data);
      void client.invalidateQueries({ queryKey: ["fee-policy", creds.subdomain] });
    },
  });
  if (!draft) return <p className="text-sm text-slate-500">{t("fees.loading")}</p>;
  const set = (patch: Partial<FeePolicy>): void => setDraft({ ...draft, ...patch });
  const num = (key: keyof FeePolicy, min: number, max: number): ReactNode => (
    <input
      className="input mx-1 inline-block w-20"
      type="number"
      min={min}
      max={max}
      disabled={!canWrite}
      value={draft[key] as number}
      onChange={(e) => set({ [key]: Number(e.target.value) })}
    />
  );
  const check = (key: keyof FeePolicy, label: string, hint?: string): ReactNode => (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        disabled={!canWrite}
        checked={draft[key] as boolean}
        onChange={(e) => set({ [key]: e.target.checked })}
      />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Card title={t("fees.rules.enrollmentTitle")}>
        <div className="space-y-4 text-sm">
          <label className="block">
            <span className="font-medium text-slate-800">{t("fees.rules.midYear")}</span>
            <select
              className="input mt-1 block w-full max-w-xl"
              disabled={!canWrite}
              value={draft.midYearPolicy}
              onChange={(e) => set({ midYearPolicy: e.target.value as FeePolicy["midYearPolicy"] })}
            >
              <option value="GROUP">{t("fees.rules.midYear.GROUP")}</option>
              <option value="PRORATA">{t("fees.rules.midYear.PRORATA")}</option>
            </select>
          </label>
          <label className="block">
            <span className="font-medium text-slate-800">{t("fees.rules.arrears")}</span>
            <select
              className="input mt-1 block w-full max-w-xl"
              disabled={!canWrite}
              value={draft.reenrollmentWithArrears}
              onChange={(e) =>
                set({ reenrollmentWithArrears: e.target.value as FeePolicy["reenrollmentWithArrears"] })
              }
            >
              <option value="ALLOW">{t("fees.rules.arrears.ALLOW")}</option>
              <option value="BLOCK">{t("fees.rules.arrears.BLOCK")}</option>
            </select>
          </label>
          <p className="rounded bg-slate-50 p-3 text-xs text-slate-600">{t("fees.rules.registrationGate")}</p>
        </div>
      </Card>
      <Card title={t("fees.rules.remindersTitle")}>
        <div className="space-y-4">
          {check("remindersEnabled", t("fees.rules.reminders"), t("fees.rules.remindersHint"))}
          <p className="text-sm text-slate-700">
            {t("fees.rules.reminderBefore")} {num("reminderDaysBefore", 0, 30)} {t("fees.rules.days")} ·{" "}
            {t("fees.rules.reminderAfter")} {num("reminderDaysAfter", 0, 30)} {t("fees.rules.days")} ·{" "}
            {t("fees.rules.reminderLong")} {num("longOverdueDays", 1, 180)} {t("fees.rules.days")}
          </p>
          {check("penaltyEnabled", t("fees.rules.penalty"), t("fees.rules.penaltyHint"))}
          {draft.penaltyEnabled ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <select
                className="input"
                disabled={!canWrite}
                value={draft.penaltyKind}
                onChange={(e) => set({ penaltyKind: e.target.value as FeePolicy["penaltyKind"] })}
              >
                <option value="AMOUNT">{t("fees.rules.penaltyAmount")}</option>
                <option value="PERCENT">{t("fees.rules.penaltyPercent")}</option>
              </select>
              <input
                className="input w-28"
                type="number"
                min="0"
                step="1"
                disabled={!canWrite}
                value={draft.penaltyKind === "PERCENT" ? draft.penaltyValue / 100 : draft.penaltyValue / 100}
                onChange={(e) => set({ penaltyValue: Math.round(Number(e.target.value) * 100) })}
              />
              {draft.penaltyKind === "PERCENT" ? "%" : "FCFA"} {t("fees.rules.penaltyAfter")}{" "}
              {num("penaltyAfterDays", 1, 180)} {t("fees.rules.daysLate")}
            </p>
          ) : null}
        </div>
      </Card>
      <Card title={t("fees.rules.consequencesTitle")}>
        <div className="space-y-4">
          {check("withholdReportCards", t("fees.rules.withhold"), t("fees.rules.withholdHint"))}
          {draft.withholdReportCards ? (
            <p className="text-sm text-slate-700">
              {t("fees.rules.withholdAfter")} {num("withholdAfterDays", 0, 180)} {t("fees.rules.daysLate")}
            </p>
          ) : null}
          {check("onlinePaymentEnabled", t("fees.rules.online"), t("fees.rules.onlineHint"))}
        </div>
      </Card>
      {canWrite ? (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={save.isPending}>
            {t("fees.save")}
          </Button>
          {save.isSuccess ? <span className="text-sm text-teal-700">{t("fees.saved")}</span> : null}
          {save.isError ? <span className="text-sm text-red-600">{errorText(save.error)}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

// ------------------------------------------------------------------ recouvrement

function RateBar({ rate }: { rate: number }): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full ${rate >= 80 ? "bg-teal-500" : rate >= 50 ? "bg-amber-400" : "bg-red-500"}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-700">{rate} %</span>
    </div>
  );
}

function BucketTable({ rows, firstColumn }: { rows: RecoveryBucket[]; firstColumn: string }): ReactNode {
  const { t } = useTranslation("app");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="pb-2 pr-4 font-medium">{firstColumn}</th>
            <th className="pb-2 pr-4 text-right font-medium">{t("fees.recovery.billed")}</th>
            <th className="pb-2 pr-4 text-right font-medium">{t("fees.recovery.paid")}</th>
            <th className="pb-2 pr-4 text-right font-medium">{t("fees.recovery.overdue")}</th>
            <th className="pb-2 font-medium">{t("fees.recovery.rate")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4">{row.label}</td>
              <td className="py-2 pr-4 text-right">{formatMoney(row.billedCents)}</td>
              <td className="py-2 pr-4 text-right">{formatMoney(row.paidCents)}</td>
              <td
                className={`py-2 pr-4 text-right ${row.overdueCents > 0 ? "font-medium text-red-600" : ""}`}
              >
                {formatMoney(row.overdueCents)}
              </td>
              <td className="py-2">
                <RateBar rate={row.recoveryRate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecoveryTab({ yearId, creds }: { yearId: string; creds: TenantCredentials }): ReactNode {
  const { t } = useTranslation("app");
  const recovery = useQuery({
    queryKey: ["fee-recovery", creds.subdomain, yearId],
    queryFn: () => getRecovery(yearId, creds),
  });
  const totals = recovery.data?.totals;
  const stats = useMemo(
    () =>
      totals
        ? [
            [t("fees.recovery.rate"), `${totals.recoveryRate} %`],
            [t("fees.recovery.paid"), formatMoney(totals.paidCents)],
            [t("fees.recovery.outstanding"), formatMoney(totals.outstandingCents)],
            [t("fees.recovery.overdue"), formatMoney(totals.overdueCents)],
            [t("fees.recovery.next30"), formatMoney(totals.expectedNext30DaysCents)],
            [t("fees.recovery.admitted"), String(totals.admittedAwaitingRegistration)],
          ]
        : [],
    [totals, t],
  );
  if (recovery.isPending) return <p className="text-sm text-slate-500">{t("fees.loading")}</p>;
  if (recovery.isError) return <p className="text-sm text-red-600">{t("list.error.loadFailed")}</p>;
  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <Card title={t("fees.recovery.byTranche")}>
        <BucketTable rows={recovery.data.byTranche} firstColumn={t("fees.recovery.tranche")} />
      </Card>
      <Card title={t("fees.recovery.byClass")}>
        <BucketTable rows={recovery.data.byClassroom} firstColumn={t("fees.recovery.classroom")} />
      </Card>
      <Card title={t("fees.recovery.late")}>
        {recovery.data.lateStudents.length === 0 ? (
          <p className="text-sm text-slate-500">{t("fees.recovery.noLate")}</p>
        ) : null}
        {recovery.data.lateStudents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("fees.recovery.student")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("fees.recovery.classroom")}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t("fees.recovery.overdue")}</th>
                  <th className="pb-2 font-medium">{t("fees.recovery.daysLate")}</th>
                </tr>
              </thead>
              <tbody>
                {recovery.data.lateStudents.map((row) => (
                  <tr key={row.studentId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4">
                      <Link className="text-teal-700 underline" to={`/eleves/${row.studentId}`}>
                        {row.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">{row.matricule}</span>
                    </td>
                    <td className="py-2 pr-4">{row.classroom}</td>
                    <td className="py-2 pr-4 text-right font-medium text-red-600">
                      {formatMoney(row.overdueCents)}
                    </td>
                    <td className="py-2">{row.daysLate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
