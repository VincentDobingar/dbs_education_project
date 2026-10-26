import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/apiClient.js";
import {
  closeOffer,
  createOffer,
  createTariff,
  formatAmount,
  formatDuration,
  getRemedialContext,
  listOfferEnrollments,
  listOffers,
  listSchoolPayouts,
  listTariffs,
  recordCashPayment,
  reviewOffer,
  submitOffer,
  updateOffer,
  updateTariff,
  type MoneyCurrency,
  type OfferInput,
  type RemedialOffer,
  type RemedialTariff,
  type TariffInput,
} from "../../lib/remedialApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

type Creds = { accessToken: string; subdomain: string };
type Tab = "offers" | "earnings" | "tariffs" | "review" | "payouts";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CLOSED: "bg-slate-200 text-slate-600",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-600",
  COMPLETED: "bg-sky-100 text-sky-800",
  PENDING: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
};

function Badge({ value }: { value: string }): ReactNode {
  const { t } = useTranslation("app");
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[value] ?? ""}`}
    >
      {t(`remedial.status.${value}`)}
    </span>
  );
}

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

const toUnits = (cents: number, currency: MoneyCurrency): string =>
  String(cents / 10 ** currency.decimalDigits);
const toCents = (units: string, currency: MoneyCurrency): number =>
  Math.round(Number(units.replace(",", ".")) * 10 ** currency.decimalDigits);

export function RemedialCoursesPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds: Creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const context = useQuery({
    queryKey: ["remedial-context", session.subdomain],
    queryFn: () => getRemedialContext(creds),
  });
  const [tab, setTab] = useState<Tab | null>(null);

  if (context.isPending) return <p className="px-6 py-10 text-sm text-slate-500">{t("remedial.loading")}</p>;
  if (context.isError || !context.data)
    return <p className="px-6 py-10 text-sm text-red-600">{t("list.error.loadFailed")}</p>;

  const { canManage, canTeach, currency } = context.data;
  const tabs: Tab[] = [
    ...(canTeach ? (["offers", "earnings"] as Tab[]) : []),
    ...(canManage ? (["review", "tariffs", "payouts"] as Tab[]) : []),
  ];
  const current = tab ?? tabs[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("remedial.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          {t("remedial.subtitle", { commission: context.data.platformShareBps / 100 })}
        </p>
      </div>

      {tabs.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {context.data.hasEmployeeRecord ? t("remedial.noAccess") : t("remedial.noEmployeeRecord")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist">
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={current === key}
                onClick={() => setTab(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  current === key
                    ? "bg-brand-night text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
              >
                {t(`remedial.tab.${key}`)}
              </button>
            ))}
          </div>
          {current === "offers" ? <TeacherOffers creds={creds} currency={currency} /> : null}
          {current === "earnings" ? <Payouts creds={creds} currency={currency} /> : null}
          {current === "review" ? <SchoolOffers creds={creds} currency={currency} /> : null}
          {current === "tariffs" ? <Tariffs creds={creds} currency={currency} /> : null}
          {current === "payouts" ? <Payouts creds={creds} currency={currency} /> : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Grille tarifaire

const EMPTY_TARIFF = {
  label: "",
  format: "GROUP",
  mode: "ONSITE",
  rate: "",
  schoolPct: "20",
  isActive: true,
};

function Tariffs({ creds, currency }: { creds: Creds; currency: MoneyCurrency }): ReactNode {
  const { t, i18n } = useTranslation("app");
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const tariffs = useQuery({
    queryKey: ["remedial-tariffs", creds.subdomain],
    queryFn: () => listTariffs(creds),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_TARIFF);

  const save = useMutation({
    mutationFn: () => {
      const input: TariffInput = {
        label: form.label.trim(),
        format: form.format as TariffInput["format"],
        mode: form.mode as TariffInput["mode"],
        hourlyRateCents: toCents(form.rate, currency),
        schoolShareBps: Math.round(Number(form.schoolPct) * 100),
        isActive: form.isActive,
      };
      return editing ? updateTariff(editing, input, creds) : createTariff(input, creds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["remedial-tariffs", creds.subdomain] });
      setForm(EMPTY_TARIFF);
      setEditing(null);
    },
  });

  function edit(tariff: RemedialTariff): void {
    setEditing(tariff.id);
    setForm({
      label: tariff.label,
      format: tariff.format,
      mode: tariff.mode,
      rate: toUnits(tariff.hourlyRateCents, currency),
      schoolPct: String(tariff.schoolShareBps / 100),
      isActive: tariff.isActive,
    });
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    save.mutate();
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-600">{t("remedial.tariffs.help")}</p>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-6">
        <label className="text-xs font-medium text-slate-600 md:col-span-2">
          {t("remedial.tariffs.label")}
          <input
            required
            className="input mt-1 w-full"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t("remedial.tariffs.labelPlaceholder")}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          {t("remedial.field.format")}
          <select
            className="input mt-1 w-full"
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
          >
            <option value="GROUP">{t("remedial.format.GROUP")}</option>
            <option value="INDIVIDUAL">{t("remedial.format.INDIVIDUAL")}</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          {t("remedial.field.mode")}
          <select
            className="input mt-1 w-full"
            value={form.mode}
            onChange={(e) => setForm({ ...form, mode: e.target.value })}
          >
            <option value="ONSITE">{t("remedial.mode.ONSITE")}</option>
            <option value="ONLINE">{t("remedial.mode.ONLINE")}</option>
            <option value="HYBRID">{t("remedial.mode.HYBRID")}</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          {t("remedial.tariffs.rate", { currency: currency.symbol })}
          <input
            required
            inputMode="decimal"
            className="input mt-1 w-full"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          {t("remedial.tariffs.schoolShare")}
          <input
            required
            type="number"
            min={0}
            max={90}
            step="0.5"
            className="input mt-1 w-full"
            value={form.schoolPct}
            onChange={(e) => setForm({ ...form, schoolPct: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          {t("remedial.tariffs.active")}
        </label>
        <div className="flex items-center gap-2 md:col-span-3 md:justify-end">
          {editing ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY_TARIFF);
              }}
            >
              {t("remedial.action.cancel")}
            </Button>
          ) : null}
          <Button type="submit" variant="secondary" disabled={save.isPending}>
            {editing ? t("remedial.action.save") : t("remedial.tariffs.add")}
          </Button>
        </div>
      </form>
      {save.isError ? <p className="text-sm text-red-600">{errorText(save.error)}</p> : null}

      {(tariffs.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">{t("remedial.tariffs.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("remedial.tariffs.label")}</th>
                <th className="pb-2 pr-4 font-medium">{t("remedial.field.format")}</th>
                <th className="pb-2 pr-4 font-medium">{t("remedial.tariffs.rateShort")}</th>
                <th className="pb-2 pr-4 font-medium">{t("remedial.tariffs.schoolShare")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(tariffs.data ?? []).map((tariff) => (
                <tr
                  key={tariff.id}
                  className={`border-b border-slate-100 last:border-0 ${tariff.isActive ? "" : "opacity-50"}`}
                >
                  <td className="py-2 pr-4 text-slate-800">{tariff.label}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {t(`remedial.format.${tariff.format}`)} · {t(`remedial.mode.${tariff.mode}`)}
                  </td>
                  <td className="py-2 pr-4 text-slate-800">
                    {formatAmount(tariff.hourlyRateCents, currency, i18n.language)}
                    {t("remedial.perHour")}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{tariff.schoolShareBps / 100} %</td>
                  <td className="py-2 pr-4 text-right">
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline"
                      onClick={() => edit(tariff)}
                    >
                      {t("remedial.action.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Offres de l'enseignant

interface OfferFormState {
  tariffId: string;
  subjectLabel: string;
  levelLabel: string;
  title: string;
  description: string;
  location: string;
  accessDetails: string;
  capacity: string;
  hours: string;
  startsOn: string;
  endsOn: string;
  scheduleNote: string;
}

const EMPTY_OFFER: OfferFormState = {
  tariffId: "",
  subjectLabel: "",
  levelLabel: "",
  title: "",
  description: "",
  location: "",
  accessDetails: "",
  capacity: "10",
  hours: "6",
  startsOn: "",
  endsOn: "",
  scheduleNote: "",
};

function toOfferInput(form: OfferFormState): OfferInput {
  return {
    tariffId: form.tariffId,
    subjectLabel: form.subjectLabel.trim(),
    levelLabel: form.levelLabel.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    ...(form.location.trim() ? { location: form.location.trim() } : {}),
    ...(form.accessDetails.trim() ? { accessDetails: form.accessDetails.trim() } : {}),
    capacity: Number(form.capacity),
    totalMinutes: Math.round(Number(form.hours.replace(",", ".")) * 60),
    startsOn: form.startsOn,
    endsOn: form.endsOn,
    scheduleNote: form.scheduleNote.trim(),
  };
}

function TeacherOffers({ creds, currency }: { creds: Creds; currency: MoneyCurrency }): ReactNode {
  const { t, i18n } = useTranslation("app");
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const offers = useQuery({
    queryKey: ["remedial-offers", "mine", creds.subdomain],
    queryFn: () => listOffers("mine", creds),
  });
  const tariffs = useQuery({
    queryKey: ["remedial-tariffs", creds.subdomain],
    queryFn: () => listTariffs(creds),
  });
  const activeTariffs = (tariffs.data ?? []).filter((tariff) => tariff.isActive);
  const [form, setForm] = useState<OfferFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openRoster, setOpenRoster] = useState<string | null>(null);

  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ["remedial-offers"] });
  const save = useMutation({
    mutationFn: (values: OfferFormState) =>
      editingId
        ? updateOffer(editingId, toOfferInput(values), creds)
        : createOffer(toOfferInput(values), creds),
    onSuccess: () => {
      invalidate();
      setForm(null);
      setEditingId(null);
    },
  });
  const submit = useMutation({ mutationFn: (id: string) => submitOffer(id, creds), onSuccess: invalidate });
  const close = useMutation({ mutationFn: (id: string) => closeOffer(id, creds), onSuccess: invalidate });

  const selectedTariff = activeTariffs.find((tariff) => tariff.id === form?.tariffId);
  const estimate =
    selectedTariff && form
      ? Math.round((selectedTariff.hourlyRateCents * Number(form.hours.replace(",", ".")) * 60) / 60)
      : null;

  function startEdit(offer: RemedialOffer): void {
    setEditingId(offer.id);
    setForm({
      tariffId: offer.tariffId,
      subjectLabel: offer.subjectLabel,
      levelLabel: offer.levelLabel,
      title: offer.title,
      description: offer.description,
      location: offer.location ?? "",
      accessDetails: offer.accessDetails ?? "",
      capacity: String(offer.capacity),
      hours: String(offer.totalMinutes / 60),
      startsOn: offer.startsOn.slice(0, 10),
      endsOn: offer.endsOn.slice(0, 10),
      scheduleNote: offer.scheduleNote,
    });
  }

  return (
    <section className="space-y-4">
      {form ? (
        <form
          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(form);
          }}
        >
          <h2 className="text-lg font-semibold text-slate-900 md:col-span-2">
            {editingId ? t("remedial.offers.editTitle") : t("remedial.offers.newTitle")}
          </h2>
          <label className="text-xs font-medium text-slate-600 md:col-span-2">
            {t("remedial.offers.tariff")}
            <select
              required
              className="input mt-1 w-full"
              value={form.tariffId}
              onChange={(e) => setForm({ ...form, tariffId: e.target.value })}
            >
              <option value="">{t("remedial.offers.chooseTariff")}</option>
              {activeTariffs.map((tariff) => (
                <option key={tariff.id} value={tariff.id}>
                  {tariff.label} — {formatAmount(tariff.hourlyRateCents, currency, i18n.language)}
                  {t("remedial.perHour")}
                </option>
              ))}
            </select>
            {activeTariffs.length === 0 ? (
              <span className="mt-1 block text-amber-700">{t("remedial.offers.noTariff")}</span>
            ) : null}
          </label>
          {(
            [
              ["title", "remedial.offers.titleField", 160],
              ["subjectLabel", "remedial.offers.subject", 120],
              ["levelLabel", "remedial.offers.level", 120],
              ["scheduleNote", "remedial.offers.schedule", 300],
              ["location", "remedial.offers.location", 200],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key} className="text-xs font-medium text-slate-600">
              {t(label)}
              <input
                required={key !== "location"}
                maxLength={max}
                className="input mt-1 w-full"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              {t("remedial.offers.hours")}
              <input
                required
                inputMode="decimal"
                className="input mt-1 w-full"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("remedial.offers.capacity")}
              <input
                required
                type="number"
                min={1}
                max={200}
                disabled={selectedTariff?.format === "INDIVIDUAL"}
                className="input mt-1 w-full"
                value={selectedTariff?.format === "INDIVIDUAL" ? "1" : form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              {t("remedial.offers.startsOn")}
              <input
                required
                type="date"
                className="input mt-1 w-full"
                value={form.startsOn}
                onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("remedial.offers.endsOn")}
              <input
                required
                type="date"
                className="input mt-1 w-full"
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            </label>
          </div>
          <label className="text-xs font-medium text-slate-600 md:col-span-2">
            {t("remedial.offers.description")}
            <textarea
              required
              maxLength={2000}
              className="input mt-1 h-24 w-full"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 md:col-span-2">
            {t("remedial.offers.accessDetails")}
            <textarea
              maxLength={1000}
              className="input mt-1 h-16 w-full"
              value={form.accessDetails}
              onChange={(e) => setForm({ ...form, accessDetails: e.target.value })}
            />
            <span className="mt-1 block font-normal text-slate-500">{t("remedial.offers.accessHelp")}</span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
            <p className="text-sm text-slate-700">
              {estimate !== null && Number.isFinite(estimate)
                ? t("remedial.offers.estimate", { price: formatAmount(estimate, currency, i18n.language) })
                : null}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setForm(null);
                  setEditingId(null);
                }}
              >
                {t("remedial.action.cancel")}
              </Button>
              <Button type="submit" variant="secondary" disabled={save.isPending}>
                {t("remedial.action.saveDraft")}
              </Button>
            </div>
          </div>
          {save.isError ? (
            <p className="text-sm text-red-600 md:col-span-2">{errorText(save.error)}</p>
          ) : null}
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setForm(EMPTY_OFFER)}>
          {t("remedial.offers.new")}
        </Button>
      )}

      {(offers.data ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {t("remedial.offers.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {(offers.data ?? []).map((offer) => (
            <li key={offer.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <OfferSummary offer={offer} currency={currency} />
              {offer.status === "REJECTED" && offer.reviewNote ? (
                <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
                  {t("remedial.offers.rejectedBecause", { note: offer.reviewNote })}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {offer.status === "DRAFT" || offer.status === "REJECTED" ? (
                  <>
                    <button
                      type="button"
                      className="text-brand-teal hover:underline"
                      onClick={() => startEdit(offer)}
                    >
                      {t("remedial.action.edit")}
                    </button>
                    <button
                      type="button"
                      className="font-semibold text-brand-night hover:underline"
                      onClick={() => submit.mutate(offer.id)}
                    >
                      {t("remedial.action.submit")}
                    </button>
                  </>
                ) : null}
                {offer.status === "PUBLISHED" || offer.status === "PENDING_REVIEW" ? (
                  <button
                    type="button"
                    className="text-slate-600 hover:underline"
                    onClick={() => close.mutate(offer.id)}
                  >
                    {t("remedial.action.close")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-brand-teal hover:underline"
                  onClick={() => setOpenRoster(openRoster === offer.id ? null : offer.id)}
                >
                  {t("remedial.offers.roster", {
                    count: offer.enrollments.confirmed + offer.enrollments.pending,
                  })}
                </button>
              </div>
              {submit.isError && submit.variables === offer.id ? (
                <p className="mt-2 text-sm text-red-600">{errorText(submit.error)}</p>
              ) : null}
              {openRoster === offer.id ? (
                <Roster offerId={offer.id} creds={creds} currency={currency} canCollectCash={false} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OfferSummary({ offer, currency }: { offer: RemedialOffer; currency: MoneyCurrency }): ReactNode {
  const { t, i18n } = useTranslation("app");
  const date = (value: string): string => new Date(value).toLocaleDateString(i18n.language);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{offer.title}</h3>
          <Badge value={offer.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {offer.subjectLabel} · {offer.levelLabel} · {t(`remedial.mode.${offer.mode}`)} ·{" "}
          {t(`remedial.format.${offer.format}`)}
          {offer.teacherName ? ` · ${offer.teacherName}` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {date(offer.startsOn)} → {date(offer.endsOn)} · {offer.scheduleNote} ·{" "}
          {formatDuration(offer.totalMinutes)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold text-slate-900">
          {formatAmount(offer.priceCents, currency, i18n.language)}
        </p>
        <p className="text-xs text-slate-500">
          {t("remedial.offers.perStudent")} · {offer.enrollments.confirmed}/{offer.capacity}{" "}
          {t("remedial.offers.confirmed")}
        </p>
      </div>
    </div>
  );
}

function Roster({
  offerId,
  creds,
  currency,
  canCollectCash,
}: {
  offerId: string;
  creds: Creds;
  currency: MoneyCurrency;
  canCollectCash: boolean;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const roster = useQuery({
    queryKey: ["remedial-roster", offerId],
    queryFn: () => listOfferEnrollments(offerId, creds),
  });
  const cash = useMutation({
    mutationFn: (enrollmentId: string) => recordCashPayment(enrollmentId, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["remedial-roster", offerId] });
      void queryClient.invalidateQueries({ queryKey: ["remedial-offers"] });
    },
  });
  if (roster.isPending) return <p className="mt-3 text-sm text-slate-500">{t("remedial.loading")}</p>;
  if ((roster.data ?? []).length === 0)
    return <p className="mt-3 text-sm text-slate-500">{t("remedial.roster.empty")}</p>;
  return (
    <div className="mt-3 overflow-x-auto border-t border-slate-100 pt-3">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-slate-500">
            <th className="pb-2 pr-4 font-medium">{t("remedial.roster.student")}</th>
            <th className="pb-2 pr-4 font-medium">{t("remedial.roster.school")}</th>
            <th className="pb-2 pr-4 font-medium">{t("remedial.roster.status")}</th>
            <th className="pb-2 pr-4 font-medium">{t("remedial.roster.contact")}</th>
            {canCollectCash ? <th className="pb-2 pr-4" /> : null}
          </tr>
        </thead>
        <tbody>
          {(roster.data ?? []).map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="py-2 pr-4 text-slate-800">
                {row.student.firstName} {row.student.lastName}
                <span className="block text-xs text-slate-400">{row.reference}</span>
              </td>
              <td className="py-2 pr-4 text-slate-600">{row.learnerSchool}</td>
              <td className="py-2 pr-4">
                <Badge value={row.status} />
              </td>
              <td className="py-2 pr-4 text-slate-600">{row.contactEmail ?? "—"}</td>
              {canCollectCash ? (
                <td className="py-2 pr-4 text-right">
                  {row.status === "PENDING_PAYMENT" ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand-teal hover:underline disabled:opacity-50"
                      disabled={cash.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t("remedial.roster.cashConfirm", {
                              amount: formatAmount(row.amountCents, currency, i18n.language),
                              reference: row.reference,
                            }),
                          )
                        )
                          cash.mutate(row.id);
                      }}
                    >
                      {t("remedial.roster.cash")}
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {cash.isError ? <p className="mt-2 text-sm text-red-600">{errorText(cash.error)}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Validation et suivi par l'établissement

function SchoolOffers({ creds, currency }: { creds: Creds; currency: MoneyCurrency }): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const offers = useQuery({
    queryKey: ["remedial-offers", "school", creds.subdomain],
    queryFn: () => listOffers("school", creds),
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openRoster, setOpenRoster] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "APPROVE" | "REJECT" }) =>
      reviewOffer(id, decision, notes[id] ?? "", creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["remedial-offers"] }),
  });
  const pending = (offers.data ?? []).filter((offer) => offer.status === "PENDING_REVIEW");
  const others = (offers.data ?? []).filter(
    (offer) => offer.status !== "PENDING_REVIEW" && offer.status !== "DRAFT",
  );

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("remedial.review.pending", { count: pending.length })}
        </h2>
        {pending.length === 0 ? <p className="text-sm text-slate-500">{t("remedial.review.none")}</p> : null}
        {pending.map((offer) => (
          <div key={offer.id} className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
            <OfferSummary offer={offer} currency={currency} />
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{offer.description}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex-1 text-xs font-medium text-slate-600">
                {t("remedial.review.note")}
                <input
                  className="input mt-1 w-full"
                  value={notes[offer.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [offer.id]: e.target.value })}
                />
              </label>
              <Button
                type="button"
                variant="primary"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: offer.id, decision: "REJECT" })}
              >
                {t("remedial.action.reject")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: offer.id, decision: "APPROVE" })}
              >
                {t("remedial.action.approve")}
              </Button>
            </div>
            {review.isError && review.variables?.id === offer.id ? (
              <p className="mt-2 text-sm text-red-600">{errorText(review.error)}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t("remedial.review.all")}</h2>
        {others.length === 0 ? <p className="text-sm text-slate-500">{t("remedial.offers.empty")}</p> : null}
        {others.map((offer) => (
          <div key={offer.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <OfferSummary offer={offer} currency={currency} />
            <button
              type="button"
              className="mt-3 text-sm text-brand-teal hover:underline"
              onClick={() => setOpenRoster(openRoster === offer.id ? null : offer.id)}
            >
              {t("remedial.offers.roster", {
                count: offer.enrollments.confirmed + offer.enrollments.pending,
              })}
            </button>
            {openRoster === offer.id ? (
              <Roster offerId={offer.id} creds={creds} currency={currency} canCollectCash />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Reversements

function Payouts({ creds, currency }: { creds: Creds; currency: MoneyCurrency }): ReactNode {
  const { t, i18n } = useTranslation("app");
  const payouts = useQuery({
    queryKey: ["remedial-payouts", creds.subdomain],
    queryFn: () => listSchoolPayouts(creds),
  });
  const rows = payouts.data ?? [];
  const pendingTotal = rows
    .filter((row) => row.status === "PENDING")
    .reduce((sum, row) => sum + row.amountCents, 0);
  const paidTotal = rows
    .filter((row) => row.status === "PAID")
    .reduce((sum, row) => sum + row.amountCents, 0);
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-800">{t("remedial.payouts.pending")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatAmount(pendingTotal, currency, i18n.language)}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-800">{t("remedial.payouts.paid")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatAmount(paidTotal, currency, i18n.language)}
          </p>
        </div>
      </div>
      <p className="text-sm text-slate-600">{t("remedial.payouts.help")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t("remedial.payouts.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("remedial.payouts.course")}</th>
                <th className="pb-2 pr-4 font-medium">{t("remedial.payouts.beneficiary")}</th>
                <th className="pb-2 pr-4 font-medium">{t("remedial.payouts.amount")}</th>
                <th className="pb-2 pr-4 font-medium">{t("remedial.roster.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-800">
                    {row.offerTitle}
                    <span className="block text-xs text-slate-400">{row.reference}</span>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{t(`remedial.beneficiary.${row.beneficiary}`)}</td>
                  <td className="py-2 pr-4 text-slate-800">
                    {formatAmount(row.amountCents, currency, i18n.language)}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge value={row.status} />
                    {row.paidReference ? (
                      <span className="ml-2 text-xs text-slate-400">{row.paidReference}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
