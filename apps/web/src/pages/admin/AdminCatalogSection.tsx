import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createPlatformCatalogItem,
  listPlatformCatalogItems,
  updatePlatformCatalogItem,
  type AdminCredentials,
  type CatalogKind,
  type PlatformCatalogItem,
} from "../../lib/platformAdminApi.js";

const KINDS: CatalogKind[] = [
  "EDUCATION_CYCLE",
  "GRADE_LEVEL",
  "SUBJECT",
  "ASSESSMENT_TYPE",
  "FEE_CATEGORY",
  "CAMPUS",
  "ROOM",
  "HOLIDAY",
];

const EMPTY_FORM = {
  code: "",
  nameFr: "",
  nameEn: "",
  order: "",
  parentCode: "",
  countryIsoCode: "",
  date: "",
};

/** "25/12" ↔ { day: 25, month: 12 } pour les jours fériés. */
function parseDayMonth(value: string): { day: number; month: number } | null {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 ? { day, month } : null;
}

function formatDayMonth(item: PlatformCatalogItem): string {
  return item.day && item.month
    ? `${String(item.day).padStart(2, "0")}/${String(item.month).padStart(2, "0")}`
    : "—";
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function EditableRow({
  item,
  cycles,
  creds,
  onSaved,
}: {
  item: PlatformCatalogItem;
  cycles: PlatformCatalogItem[];
  creds: AdminCredentials;
  onSaved: () => void;
}): ReactNode {
  const { t } = useTranslation("app");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    nameFr: item.nameFr,
    nameEn: item.nameEn,
    order: String(item.order),
    parentCode: item.parentCode ?? "",
    date: item.kind === "HOLIDAY" ? formatDayMonth(item) : "",
  });

  const save = useMutation({
    mutationFn: () =>
      updatePlatformCatalogItem(
        item.id,
        {
          nameFr: draft.nameFr,
          nameEn: draft.nameEn,
          order: Number(draft.order) || 0,
          ...(item.kind === "GRADE_LEVEL" && draft.parentCode ? { parentCode: draft.parentCode } : {}),
          ...(item.kind === "HOLIDAY" ? (parseDayMonth(draft.date) ?? {}) : {}),
        },
        creds,
      ),
    onSuccess: () => {
      setIsEditing(false);
      onSaved();
    },
  });
  const toggle = useMutation({
    mutationFn: () => updatePlatformCatalogItem(item.id, { isActive: !item.isActive }, creds),
    onSuccess: onSaved,
  });

  const cycleName = cycles.find((cycle) => cycle.code === item.parentCode)?.nameFr ?? item.parentCode;

  return (
    <tr className={`border-b border-slate-100 last:border-0 ${item.isActive ? "" : "opacity-50"}`}>
      <td className="py-2 pr-3 font-mono text-xs text-slate-600">{item.code}</td>
      {isEditing ? (
        <>
          <td className="py-2 pr-3">
            <input
              className="input w-full"
              value={draft.nameFr}
              onChange={(event) => setDraft({ ...draft, nameFr: event.target.value })}
            />
          </td>
          <td className="py-2 pr-3">
            <input
              className="input w-full"
              value={draft.nameEn}
              onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
            />
          </td>
          {item.kind === "GRADE_LEVEL" ? (
            <td className="py-2 pr-3">
              <select
                className="input"
                value={draft.parentCode}
                onChange={(event) => setDraft({ ...draft, parentCode: event.target.value })}
              >
                {cycles.map((cycle) => (
                  <option key={cycle.code} value={cycle.code}>
                    {cycle.nameFr}
                  </option>
                ))}
              </select>
            </td>
          ) : null}
          {item.kind === "HOLIDAY" ? (
            <>
              <td className="py-2 pr-3 text-slate-600">{item.countryIsoCode}</td>
              <td className="py-2 pr-3">
                <input
                  className="input w-24"
                  placeholder="jj/mm"
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                />
              </td>
            </>
          ) : null}
          <td className="py-2 pr-3">
            <input
              type="number"
              className="input w-20"
              value={draft.order}
              onChange={(event) => setDraft({ ...draft, order: event.target.value })}
            />
          </td>
          <td className="space-x-3 whitespace-nowrap py-2 pr-3">
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t("admin.catalog.save")}
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={() => setIsEditing(false)}
            >
              {t("admin.catalog.cancel")}
            </button>
            {save.isError ? <span className="text-xs text-red-600">{errorText(save.error)}</span> : null}
          </td>
        </>
      ) : (
        <>
          <td className="py-2 pr-3 text-slate-800">{item.nameFr}</td>
          <td className="py-2 pr-3 text-slate-600">{item.nameEn}</td>
          {item.kind === "GRADE_LEVEL" ? <td className="py-2 pr-3 text-slate-600">{cycleName}</td> : null}
          {item.kind === "HOLIDAY" ? (
            <>
              <td className="py-2 pr-3 text-slate-600">{item.countryIsoCode}</td>
              <td className="py-2 pr-3 text-slate-600">{formatDayMonth(item)}</td>
            </>
          ) : null}
          <td className="py-2 pr-3 text-slate-600">{item.order}</td>
          <td className="space-x-3 whitespace-nowrap py-2 pr-3">
            <button
              type="button"
              className="text-xs text-brand-teal hover:underline"
              onClick={() => setIsEditing(true)}
            >
              {t("admin.catalog.edit")}
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {item.isActive ? t("admin.catalog.deactivate") : t("admin.catalog.reactivate")}
            </button>
          </td>
        </>
      )}
    </tr>
  );
}

/**
 * §17 : catalogue de référence global proposé aux établissements dans
 * Configuration. Désactiver un élément le retire des listes de choix, sans
 * toucher aux établissements qui l'ont déjà importé (copie).
 */
export function AdminCatalogSection({ creds }: { creds: AdminCredentials }): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CatalogKind>("EDUCATION_CYCLE");
  const [form, setForm] = useState(EMPTY_FORM);

  const items = useQuery({
    queryKey: ["admin-catalog", kind],
    queryFn: () => listPlatformCatalogItems(kind, creds),
  });
  const cycles = useQuery({
    queryKey: ["admin-catalog", "EDUCATION_CYCLE"],
    queryFn: () => listPlatformCatalogItems("EDUCATION_CYCLE", creds),
  });

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
  }

  const create = useMutation({
    mutationFn: () =>
      createPlatformCatalogItem(
        {
          kind,
          code: form.code.trim().toUpperCase(),
          nameFr: form.nameFr.trim(),
          nameEn: form.nameEn.trim(),
          order: Number(form.order) || 0,
          ...(kind === "GRADE_LEVEL" && form.parentCode ? { parentCode: form.parentCode } : {}),
          ...(kind === "HOLIDAY"
            ? {
                countryIsoCode: form.countryIsoCode.trim().toUpperCase(),
                ...(parseDayMonth(form.date) ?? {}),
              }
            : {}),
        },
        creds,
      ),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      refresh();
    },
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    create.mutate();
  }

  const cycleList = cycles.data ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-600">{t("admin.catalog.subtitle")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {KINDS.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => {
              setKind(entry);
              setForm(EMPTY_FORM);
            }}
            className={`rounded-full px-3 py-1 text-sm ${
              kind === entry ? "bg-brand-teal text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t(`admin.catalog.kind.${entry}`)}
          </button>
        ))}
      </div>

      {items.isError ? <p className="mt-4 text-sm text-red-600">{errorText(items.error)}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.code")}</th>
              <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.nameFr")}</th>
              <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.nameEn")}</th>
              {kind === "GRADE_LEVEL" ? (
                <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.cycle")}</th>
              ) : null}
              {kind === "HOLIDAY" ? (
                <>
                  <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.country")}</th>
                  <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.date")}</th>
                </>
              ) : null}
              <th className="pb-2 pr-3 font-medium">{t("admin.catalog.col.order")}</th>
              <th className="pb-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {(items.data ?? []).map((item) => (
              <EditableRow key={item.id} item={item} cycles={cycleList} creds={creds} onSaved={refresh} />
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
        <input
          className="input w-28"
          placeholder={t("admin.catalog.col.code")}
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })}
        />
        <input
          className="input w-48"
          placeholder={t("admin.catalog.col.nameFr")}
          value={form.nameFr}
          onChange={(event) => setForm({ ...form, nameFr: event.target.value })}
        />
        <input
          className="input w-48"
          placeholder={t("admin.catalog.col.nameEn")}
          value={form.nameEn}
          onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
        />
        {kind === "GRADE_LEVEL" ? (
          <select
            className="input w-48"
            value={form.parentCode}
            onChange={(event) => setForm({ ...form, parentCode: event.target.value })}
          >
            <option value="">{t("admin.catalog.selectCycle")}</option>
            {cycleList.map((cycle) => (
              <option key={cycle.code} value={cycle.code}>
                {cycle.nameFr}
              </option>
            ))}
          </select>
        ) : null}
        {kind === "HOLIDAY" ? (
          <>
            <input
              className="input w-24"
              placeholder={t("admin.catalog.col.country")}
              maxLength={2}
              value={form.countryIsoCode}
              onChange={(event) => setForm({ ...form, countryIsoCode: event.target.value })}
            />
            <input
              className="input w-24"
              placeholder="jj/mm"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </>
        ) : null}
        <input
          type="number"
          className="input w-24"
          placeholder={t("admin.catalog.col.order")}
          value={form.order}
          onChange={(event) => setForm({ ...form, order: event.target.value })}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={
            create.isPending ||
            !form.code.trim() ||
            !form.nameFr.trim() ||
            !form.nameEn.trim() ||
            (kind === "GRADE_LEVEL" && !form.parentCode) ||
            (kind === "HOLIDAY" && (form.countryIsoCode.trim().length !== 2 || !parseDayMonth(form.date)))
          }
        >
          {t("admin.common.create")}
        </Button>
      </form>
      {create.isError ? <p className="mt-2 text-sm text-red-600">{errorText(create.error)}</p> : null}
    </section>
  );
}
