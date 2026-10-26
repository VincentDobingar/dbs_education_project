import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin, Search, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  formatAmount,
  formatDuration,
  listCatalog,
  type CatalogOffer,
  type RemedialMode,
} from "../lib/remedialApi.js";

/**
 * Catalogue des cours de renforcement publiés, tous établissements confondus.
 * Partagé par le site public (sans compte) et le portail famille, qui y ajoute
 * le bouton d'inscription via `renderAction`.
 */
export function RemedialCatalog({
  renderAction,
}: {
  renderAction: (offer: CatalogOffer) => ReactNode;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<RemedialMode | "">("");
  const [country, setCountry] = useState("");
  const catalog = useQuery({
    queryKey: ["remedial-catalog", q, mode, country],
    queryFn: () =>
      listCatalog({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(mode ? { mode } : {}),
        ...(country ? { country } : {}),
      }),
    staleTime: 60_000,
  });
  const isEn = i18n.language.startsWith("en");
  const date = (value: string): string =>
    new Date(value).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">{t("remedial.catalog.search")}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className="input w-full pl-9"
            placeholder={t("remedial.catalog.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          className="input w-44"
          aria-label={t("remedial.field.mode")}
          value={mode}
          onChange={(e) => setMode(e.target.value as RemedialMode | "")}
        >
          <option value="">{t("remedial.catalog.allModes")}</option>
          <option value="ONSITE">{t("remedial.mode.ONSITE")}</option>
          <option value="ONLINE">{t("remedial.mode.ONLINE")}</option>
          <option value="HYBRID">{t("remedial.mode.HYBRID")}</option>
        </select>
        <select
          className="input w-44"
          aria-label={t("remedial.catalog.country")}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">{t("remedial.catalog.allCountries")}</option>
          <option value="TD">{isEn ? "Chad" : "Tchad"}</option>
          <option value="CM">{isEn ? "Cameroon" : "Cameroun"}</option>
        </select>
      </div>

      {catalog.isPending ? <p className="text-sm text-slate-500">{t("remedial.loading")}</p> : null}
      {catalog.isError ? <p className="text-sm text-red-600">{t("list.error.loadFailed")}</p> : null}
      {catalog.data && catalog.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t("remedial.catalog.empty")}
        </p>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2">
        {(catalog.data ?? []).map((offer) => (
          <li
            key={offer.id}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">
                  {offer.subjectLabel} · {offer.levelLabel}
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">{offer.title}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {offer.teacher} — {offer.school.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">
                  {formatAmount(offer.priceCents, offer.currency, i18n.language)}
                </p>
                <p className="text-xs text-slate-500">{t("remedial.offers.perStudent")}</p>
              </div>
            </div>
            <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600">{offer.description}</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
              <li className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {date(offer.startsOn)} → {date(offer.endsOn)}
              </li>
              <li className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {formatDuration(offer.totalMinutes)} · {offer.scheduleNote}
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {t(`remedial.mode.${offer.mode}`)}
                {offer.school.city ? ` · ${offer.school.city}` : ""},{" "}
                {isEn ? offer.school.countryNameEn : offer.school.countryNameFr}
              </li>
              <li className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {offer.seatsLeft > 0
                  ? t("remedial.catalog.seatsLeft", { count: offer.seatsLeft })
                  : t("remedial.catalog.full")}
              </li>
            </ul>
            <div className="mt-4">{renderAction(offer)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
