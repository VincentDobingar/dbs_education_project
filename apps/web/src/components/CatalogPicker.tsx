import { Button } from "@edumanage/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, type TenantCredentials } from "../lib/apiClient.js";
import {
  importCatalogItems,
  listCatalogItems,
  type CatalogItem,
  type CatalogKind,
  type ImportCatalogOptions,
} from "../lib/schoolConfigApi.js";

interface CatalogPickerProps {
  kind: CatalogKind;
  /** Codes déjà présents dans l'établissement — masqués de la liste de choix. */
  existingCodes?: readonly string[];
  /** Variante de `existingCodes` quand l'établissement ne stocke pas le code (salles, calendrier). */
  isExisting?: (item: CatalogItem) => boolean;
  /** Libellé secondaire d'un élément (par défaut son code). */
  describe?: (item: CatalogItem) => string | null;
  importOptions?: ImportCatalogOptions;
  /** Empêche l'ajout tant qu'un prérequis manque (ex. année scolaire à choisir). */
  disabledReason?: string | null;
  /** Champs complémentaires affichés avant le bouton d'ajout (campus, capacité…). */
  children?: ReactNode;
  creds: TenantCredentials;
  onImported: () => void;
}

function localizedName(item: CatalogItem, language: string): string {
  return language.startsWith("en") ? item.nameEn : item.nameFr;
}

/**
 * §17 : liste de choix issue du catalogue de référence global. L'établissement
 * coche ce qui le concerne et l'ajoute en un clic (copie côté API) ; la saisie
 * libre reste disponible à côté pour ce qui n'y figure pas.
 */
export function CatalogPicker({
  kind,
  existingCodes = [],
  isExisting,
  describe = (item) => item.code,
  importOptions,
  disabledReason,
  children,
  creds,
  onImported,
}: CatalogPickerProps): ReactNode {
  const { t, i18n } = useTranslation("app");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const catalog = useQuery({
    queryKey: ["catalog", kind],
    queryFn: () => listCatalogItems(kind, creds),
    staleTime: 10 * 60 * 1000,
  });
  // Niveaux : regroupés par cycle, dont il faut les libellés.
  const cycles = useQuery({
    queryKey: ["catalog", "EDUCATION_CYCLE"],
    queryFn: () => listCatalogItems("EDUCATION_CYCLE", creds),
    enabled: kind === "GRADE_LEVEL",
    staleTime: 10 * 60 * 1000,
  });

  const importMutation = useMutation({
    mutationFn: () => importCatalogItems(kind, [...selected], creds, importOptions),
    onMutate: () => setFeedback(null),
    onSuccess: (result) => {
      setSelected(new Set());
      setFeedback({
        tone: "success",
        text:
          result.skipped.length > 0
            ? `${t("catalog.imported", { count: result.created.length })} ${t("catalog.skipped", { count: result.skipped.length })}`
            : t("catalog.imported", { count: result.created.length }),
      });
      onImported();
    },
    onError: (error) =>
      setFeedback({
        tone: "error",
        text:
          error instanceof ApiError && error.status === 403
            ? t("catalog.error.forbidden")
            : t("catalog.error.generic"),
      }),
  });

  if (catalog.isPending) return <p className="text-sm text-slate-500">{t("catalog.loading")}</p>;
  if (catalog.isError) return null;

  const existing = new Set(existingCodes);
  const available = catalog.data.filter((item) => !(isExisting ? isExisting(item) : existing.has(item.code)));

  if (available.length === 0) {
    return catalog.data.length > 0 ? <p className="text-sm text-slate-500">{t("catalog.allAdded")}</p> : null;
  }

  function toggle(code: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(codes: string[]): void {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = codes.every((code) => next.has(code));
      for (const code of codes) {
        if (allSelected) next.delete(code);
        else next.add(code);
      }
      return next;
    });
  }

  const groups: { key: string; label: string | null; items: CatalogItem[] }[] =
    kind === "GRADE_LEVEL"
      ? [...new Set(available.map((item) => item.parentCode ?? ""))].map((parentCode) => {
          const cycle = cycles.data?.find((candidate) => candidate.code === parentCode);
          return {
            key: parentCode,
            label: cycle ? localizedName(cycle, i18n.language) : parentCode,
            items: available.filter((item) => (item.parentCode ?? "") === parentCode),
          };
        })
      : [{ key: "all", label: null, items: available }];

  return (
    <div className="rounded-md border border-teal-100 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{t("catalog.title")}</p>
        <button
          type="button"
          className="text-xs text-brand-teal hover:underline"
          onClick={() => toggleGroup(available.map((item) => item.code))}
        >
          {t("catalog.toggleAll")}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.key}>
            {group.label ? (
              <button
                type="button"
                className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
                onClick={() => toggleGroup(group.items.map((item) => item.code))}
              >
                {group.label}
              </button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => {
                const isSelected = selected.has(item.code);
                return (
                  <label
                    key={item.code}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                      isSelected
                        ? "border-brand-teal bg-white text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={isSelected}
                      onChange={() => toggle(item.code)}
                    />
                    {localizedName(item, i18n.language)}
                    {describe(item) ? <span className="text-xs text-slate-400">{describe(item)}</span> : null}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {children}
        <Button
          type="button"
          variant="secondary"
          disabled={selected.size === 0 || importMutation.isPending || Boolean(disabledReason)}
          onClick={() => importMutation.mutate()}
        >
          {t("catalog.addSelection", { count: selected.size })}
        </Button>
        {disabledReason ? <span className="text-sm text-amber-700">{disabledReason}</span> : null}
        {feedback ? (
          <span className={`text-sm ${feedback.tone === "success" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Saisie libre repliée sous la liste de choix, pour ce qui n'est pas au catalogue. */
export function ManualEntry({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslation("app");
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-slate-600 hover:text-slate-900">
        {t("catalog.manualEntry")}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
