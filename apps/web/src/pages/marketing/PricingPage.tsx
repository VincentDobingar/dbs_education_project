import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  formatMoney,
  getPublicPricingOrSnapshot,
  listPublicCountriesOrSnapshot,
  monthlyPriceFor,
  recommendedSchoolPlan,
  REGION_ORDER,
  type PublicCountry,
  type PublicCurrency,
  type PublicPricing,
} from "../../lib/publicApi.js";

const SCHOOL_PLANS = ["SCHOOL_ESSENTIAL", "SCHOOL_PROFESSIONAL", "SCHOOL_PREMIUM"] as const;
const PARENT_PLANS = ["PARENT_BASIC", "PARENT_PREMIUM", "FAMILY_PLAN"] as const;
const STUDENT_PLANS = ["STUDENT_BASIC", "STUDENT_PREMIUM"] as const;
const DURATIONS = [1, 3, 10, 12] as const;
const DEFAULT_COUNTRY = "CM";
/** Monnaies partagées par plusieurs pays, présentées en tête du tableau par zone. */
const ZONE_FIRST = ["XAF", "XOF", "ZAR"];

/** Pays deviné à partir de la langue du navigateur (« fr-SN » → SN), sinon Cameroun. */
function guessCountry(countries: PublicCountry[]): string {
  const languages = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const language of languages) {
    const region = language.split("-")[1]?.toUpperCase();
    if (region && countries.some((country) => country.isoCode === region)) {
      return region;
    }
  }
  return DEFAULT_COUNTRY;
}

function useLocaleHelpers(): { locale: string; isFr: boolean } {
  const { i18n } = useTranslation();
  const isFr = i18n.language.startsWith("fr");
  return { locale: isFr ? "fr-FR" : "en-GB", isFr };
}

function CountrySelect({
  countries,
  value,
  onChange,
}: {
  countries: PublicCountry[];
  value: string;
  onChange: (isoCode: string) => void;
}): ReactNode {
  const { t } = useTranslation("marketing");
  const { isFr, locale } = useLocaleHelpers();
  const name = (country: PublicCountry): string => (isFr ? country.nameFr : country.nameEn);

  return (
    <select
      id="pricing-country"
      className="input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {REGION_ORDER.map((region) => {
        const regionCountries = countries
          .filter((country) => country.region === region)
          .sort((a, b) => name(a).localeCompare(name(b), locale));
        if (regionCountries.length === 0) {
          return null;
        }
        return (
          <optgroup key={region} label={t(`pricing.region.${region}`)}>
            {regionCountries.map((country) => (
              <option key={country.isoCode} value={country.isoCode}>
                {name(country)} ({country.isoCode})
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

function Simulator({
  countries,
  pricing,
  country,
  onCountryChange,
}: {
  countries: PublicCountry[];
  pricing: PublicPricing;
  country: PublicCountry;
  onCountryChange: (isoCode: string) => void;
}): ReactNode {
  const { t } = useTranslation("marketing");
  const { locale, isFr } = useLocaleHelpers();
  const [studentCount, setStudentCount] = useState(250);
  const [months, setMonths] = useState<(typeof DURATIONS)[number]>(10);

  const currency = country.currency;
  const sameZoneCount = currency
    ? countries.filter((other) => other.currency?.isoCode === currency.isoCode).length
    : 0;
  const plan = recommendedSchoolPlan(pricing.plans, Math.max(1, studentCount));
  const monthly = plan ? monthlyPriceFor(pricing, plan.code, country) : null;
  const money = (amount: number): string => (currency ? formatMoney(amount, currency, locale) : "—");
  const familyPlan = monthlyPriceFor(pricing, "FAMILY_PLAN", country);
  const parentPlan = monthlyPriceFor(pricing, "PARENT_BASIC", country);

  return (
    <section
      aria-labelledby="simulator-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 id="simulator-title" className="text-xl font-semibold text-slate-900">
        {t("pricing.simulator.title")}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{t("pricing.simulator.subtitle")}</p>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700" htmlFor="pricing-country">
          {t("pricing.simulator.country")}
          <div className="mt-1">
            <CountrySelect countries={countries} value={country.isoCode} onChange={onCountryChange} />
          </div>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t("pricing.simulator.students")}
          <input
            type="number"
            min={1}
            max={100000}
            inputMode="numeric"
            className="input mt-1"
            value={studentCount}
            onChange={(event) => setStudentCount(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t("pricing.simulator.duration")}
          <select
            className="input mt-1"
            value={months}
            onChange={(event) => setMonths(Number(event.target.value) as (typeof DURATIONS)[number])}
          >
            {DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {t(`pricing.simulator.duration.${duration}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {currency ? (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
          <div className="flex gap-1">
            <dt>{t("pricing.simulator.currency")} :</dt>
            <dd className="font-medium text-slate-700">
              {isFr ? currency.nameFr : currency.nameEn} ({currency.isoCode})
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>{t("pricing.simulator.codes")} :</dt>
            <dd className="font-medium text-slate-700">
              {country.isoCode} · {country.isoAlpha3} · {country.phoneCallingCode}
            </dd>
          </div>
          {country.monetaryZone ? (
            <div className="flex gap-1">
              <dt>{t("pricing.simulator.zone")} :</dt>
              <dd className="font-medium text-slate-700">
                {isFr ? country.monetaryZone.nameFr : country.monetaryZone.nameEn} —{" "}
                {t("pricing.simulator.sameZone", { count: sameZoneCount })}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-xl bg-brand-night p-6 text-white md:grid-cols-[1.4fr_1fr]">
        {plan && monthly !== null ? (
          <div>
            <p className="text-sm text-white/70">
              {t("pricing.simulator.recommended")}{" "}
              <strong className="text-brand-teal">{t(`pricing.plan.${plan.code}.name`)}</strong>
            </p>
            <p className="mt-1 text-3xl font-bold" data-testid="simulator-monthly">
              {money(monthly)}{" "}
              <span className="text-base font-normal text-white/70">{t("pricing.perMonth")}</span>
            </p>
            <p className="mt-2 text-sm text-white/80">
              {t("pricing.simulator.perStudent", {
                amount: money(Math.round(monthly / Math.max(1, studentCount))),
              })}
            </p>
            <p className="mt-4 text-sm text-white/80">
              {t("pricing.simulator.total", { count: months, amount: money(monthly * months) })}
            </p>
            <p className="mt-1 text-xs text-white/60">{t("pricing.simulator.trial")}</p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-semibold">{t("pricing.contactSales")}</p>
            <p className="mt-2 text-sm text-white/70">{t("pricing.simulator.enterprise")}</p>
            <Link to="/contact" className="mt-4 inline-block text-sm font-semibold text-brand-teal underline">
              {t("nav.contact")}
            </Link>
          </div>
        )}
        <div className="border-t border-white/10 pt-4 text-sm md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <p className="text-white/70">{t("pricing.simulator.families")}</p>
          <ul className="mt-2 space-y-1">
            {parentPlan !== null ? (
              <li>
                {t("pricing.plan.PARENT_BASIC.name")} : <strong>{money(parentPlan)}</strong>{" "}
                {t("pricing.perMonth")}
              </li>
            ) : null}
            {familyPlan !== null ? (
              <li>
                {t("pricing.plan.FAMILY_PLAN.name")} : <strong>{money(familyPlan)}</strong>{" "}
                {t("pricing.perMonth")}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {pricing.exchangeRateDate
          ? t("pricing.simulator.disclaimer", {
              date: new Date(pricing.exchangeRateDate).toLocaleDateString(locale, { dateStyle: "long" }),
            })
          : t("pricing.subtitle")}
      </p>
    </section>
  );
}

function PlanGrid({
  planCodes,
  pricing,
  country,
}: {
  planCodes: readonly string[];
  pricing: PublicPricing | undefined;
  country: PublicCountry | undefined;
}): ReactNode {
  const { t } = useTranslation("marketing");
  const { locale } = useLocaleHelpers();

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {planCodes.map((code) => {
        const amount = pricing && country ? monthlyPriceFor(pricing, code, country) : null;
        return (
          <div key={code} className="flex flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">{t(`pricing.plan.${code}.name`)}</h3>
            {amount !== null && country?.currency ? (
              <p className="mt-2 text-2xl font-bold text-brand-night">
                {formatMoney(amount, country.currency, locale)}{" "}
                <span className="text-sm font-normal text-slate-500">{t("pricing.perMonth")}</span>
              </p>
            ) : null}
            <p className="mt-2 flex-1 text-sm text-slate-600">{t(`pricing.plan.${code}.description`)}</p>
          </div>
        );
      })}
    </div>
  );
}

interface ZoneRow {
  currency: PublicCurrency;
  countries: PublicCountry[];
}

function ZoneTable({
  countries,
  pricing,
}: {
  countries: PublicCountry[];
  pricing: PublicPricing;
}): ReactNode {
  const { t } = useTranslation("marketing");
  const { locale, isFr } = useLocaleHelpers();

  const rows = useMemo(() => {
    const byCurrency = new Map<string, ZoneRow>();
    for (const country of countries) {
      if (!country.currency) continue;
      const row = byCurrency.get(country.currency.isoCode) ?? { currency: country.currency, countries: [] };
      row.countries.push(country);
      byCurrency.set(country.currency.isoCode, row);
    }
    // Les monnaies partagées (CEMAC, UEMOA, rand) d'abord, puis par nom de pays.
    const rank = (iso: string): number =>
      ZONE_FIRST.includes(iso) ? ZONE_FIRST.indexOf(iso) : ZONE_FIRST.length;
    const label = (row: ZoneRow): string => (isFr ? row.countries[0]!.nameFr : row.countries[0]!.nameEn);
    return [...byCurrency.values()].sort(
      (a, b) =>
        rank(a.currency.isoCode) - rank(b.currency.isoCode) || label(a).localeCompare(label(b), locale),
    );
  }, [countries, isFr, locale]);

  const columns = ["SCHOOL_ESSENTIAL", "SCHOOL_PROFESSIONAL", "SCHOOL_PREMIUM", "FAMILY_PLAN"] as const;

  return (
    <details className="group mt-16 rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-semibold text-slate-900">
        {t("pricing.zones.title", { count: countries.length })}
        <span className="text-brand-teal transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="overflow-x-auto border-t border-slate-200">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">{t("pricing.zones.currency")}</th>
              <th className="px-4 py-2 font-medium">{t("pricing.zones.countries")}</th>
              {columns.map((code) => (
                <th key={code} className="px-4 py-2 text-right font-medium">
                  {t(`pricing.plan.${code}.name`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ currency, countries: rowCountries }) => (
              <tr key={currency.isoCode} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2 font-medium text-slate-900">
                  {currency.isoCode}
                  <span className="block text-xs font-normal text-slate-500">
                    {isFr ? currency.nameFr : currency.nameEn}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {rowCountries
                    .map((country) => `${isFr ? country.nameFr : country.nameEn} (${country.isoCode})`)
                    .join(", ")}
                </td>
                {columns.map((code) => {
                  const amount = monthlyPriceFor(pricing, code, rowCountries[0]!);
                  return (
                    <td key={code} className="whitespace-nowrap px-4 py-2 text-right text-slate-900">
                      {amount !== null ? formatMoney(amount, currency, locale) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-6 py-3 text-xs text-slate-500">{t("pricing.zones.note")}</p>
    </details>
  );
}

export function PricingPage(): ReactNode {
  const { t } = useTranslation("marketing");
  const countriesQuery = useQuery({
    queryKey: ["public-countries-or-snapshot"],
    queryFn: listPublicCountriesOrSnapshot,
    staleTime: 600_000,
  });
  const pricingQuery = useQuery({
    queryKey: ["public-pricing"],
    queryFn: getPublicPricingOrSnapshot,
    staleTime: 600_000,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const countries = countriesQuery.data ?? [];
  const pricing = pricingQuery.data;
  const countryIso = selected ?? (countries.length ? guessCountry(countries) : DEFAULT_COUNTRY);
  const country = countries.find((entry) => entry.isoCode === countryIso) ?? countries[0];
  const failed = countriesQuery.isError || pricingQuery.isError;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">{t("pricing.title")}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-slate-600">{t("pricing.subtitleLocal")}</p>
      </div>

      <div className="mt-10">
        {pricing && country ? (
          <Simulator
            countries={countries}
            pricing={pricing}
            country={country}
            onCountryChange={setSelected}
          />
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {failed ? t("pricing.simulator.unavailable") : t("pricing.simulator.loading")}
          </p>
        )}
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-slate-900">{t("pricing.school.title")}</h2>
        <div className="mt-6">
          <PlanGrid planCodes={SCHOOL_PLANS} pricing={pricing} country={country} />
        </div>
        <p className="mt-4 text-sm text-slate-500">{t("pricing.contactSales")}</p>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold text-slate-900">{t("pricing.parent.title")}</h2>
        <div className="mt-6">
          <PlanGrid planCodes={PARENT_PLANS} pricing={pricing} country={country} />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold text-slate-900">{t("pricing.student.title")}</h2>
        <div className="mt-6">
          <PlanGrid planCodes={STUDENT_PLANS} pricing={pricing} country={country} />
        </div>
      </section>

      {pricing && countries.length ? <ZoneTable countries={countries} pricing={pricing} /> : null}

      <div className="mt-16 text-center">
        <Link to="/inscription" className="text-brand-teal underline">
          {t("nav.subscribe")}
        </Link>
      </div>
    </div>
  );
}
