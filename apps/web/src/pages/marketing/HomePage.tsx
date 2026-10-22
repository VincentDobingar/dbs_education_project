import { Button } from "@edumanage/ui";
import {
  BookOpen,
  CalendarDays,
  CircleCheck,
  ClipboardCheck,
  GraduationCap,
  Languages,
  Library,
  ListChecks,
  Megaphone,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { InstallAppButton } from "../../components/InstallAppButton.js";

const AUDIENCE_CARDS = [
  {
    icon: GraduationCap,
    titleKey: "home.audience.school.title",
    descriptionKey: "home.audience.school.description",
    ctaKey: "home.audience.school.cta",
    to: "/inscription",
  },
  {
    icon: Users,
    titleKey: "home.audience.parent.title",
    descriptionKey: "home.audience.parent.description",
    ctaKey: "home.audience.parent.cta",
    to: "/portail/connexion",
  },
  {
    icon: BookOpen,
    titleKey: "home.audience.student.title",
    descriptionKey: "home.audience.student.description",
    ctaKey: "home.audience.student.cta",
    to: "/portail/connexion",
  },
] as const;

const MODULES = [
  { icon: GraduationCap, key: "home.modules.students" },
  { icon: ClipboardCheck, key: "home.modules.grades" },
  { icon: ListChecks, key: "home.modules.attendance" },
  { icon: CalendarDays, key: "home.modules.timetable" },
  { icon: Wallet, key: "home.modules.finance" },
  { icon: UserCog, key: "home.modules.staff" },
  { icon: Megaphone, key: "home.modules.communication" },
  { icon: Library, key: "home.modules.services" },
] as const;

const OFFLINE_POINTS = [
  "home.offline.point.install",
  "home.offline.point.cache",
  "home.offline.point.slow",
  "home.offline.point.light",
] as const;

const FEATURE_CARDS = [
  {
    icon: ShieldCheck,
    titleKey: "home.features.multitenant.title",
    descriptionKey: "home.features.multitenant.description",
  },
  {
    icon: ListChecks,
    titleKey: "home.features.setup.title",
    descriptionKey: "home.features.setup.description",
  },
  {
    icon: Smartphone,
    titleKey: "home.features.payments.title",
    descriptionKey: "home.features.payments.description",
  },
  {
    icon: Languages,
    titleKey: "home.features.multilingual.title",
    descriptionKey: "home.features.multilingual.description",
  },
] as const;

const STEPS = [1, 2, 3, 4] as const;

const FAQ = ["install", "offline", "security", "parents", "help"] as const;

const HERO_BADGES = ["home.hero.badge.trial", "home.hero.badge.noInstall", "home.hero.badge.mobile"] as const;

/** Aperçu d'écran de téléphone hors connexion : montre ce que voit un parent sans réseau. */
function OfflinePhonePreview(): ReactNode {
  const { t } = useTranslation("app");
  return (
    <div
      aria-hidden="true"
      className="mx-auto hidden w-64 rounded-[2rem] lg:block border-[10px] border-slate-800 bg-white shadow-2xl"
    >
      <div className="bg-amber-500 px-3 py-2 text-center text-[11px] font-medium leading-tight text-amber-950">
        {t("pwa.offlineBanner")}
      </div>
      <div className="space-y-3 p-4">
        <div className="h-3 w-24 rounded bg-slate-800" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="rounded-lg border border-slate-200 p-3">
            <div className="h-2.5 w-28 rounded bg-slate-300" />
            <div className="mt-2 h-2 w-full rounded bg-slate-100" />
            <div className="mt-1.5 h-2 w-3/4 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomePage(): ReactNode {
  const { t } = useTranslation("marketing");

  return (
    <>
      {/* Accroche */}
      <section className="bg-brand-night">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal">
            {t("home.hero.eyebrow")}
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold text-white sm:text-5xl">
            {t("home.hero.title")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">{t("home.hero.subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link to="/inscription">
              <Button variant="secondary">{t("home.hero.ctaPrimary")}</Button>
            </Link>
            <Link to="/tarifs">
              <Button variant="primary">{t("home.hero.ctaSecondary")}</Button>
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            {HERO_BADGES.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-brand-teal" aria-hidden="true" />
                {t(key)}
              </li>
            ))}
          </ul>
          <Link
            to="/portail/connexion"
            className="mt-6 inline-block text-sm font-medium text-brand-teal underline-offset-4 hover:underline"
          >
            {t("home.hero.parentLink")}
          </Link>
        </div>
      </section>

      {/* Trois espaces */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-slate-900">{t("home.audience.title")}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {AUDIENCE_CARDS.map(({ icon: Icon, titleKey, descriptionKey, ctaKey, to }) => (
            <div
              key={titleKey}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            >
              <Icon className="h-8 w-8 text-brand-teal" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(titleKey)}</h3>
              <p className="mt-2 flex-1 text-sm text-slate-600">{t(descriptionKey)}</p>
              <Link to={to} className="mt-4 text-sm font-semibold text-brand-night hover:text-brand-teal">
                {t(ctaKey)} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-slate-900">{t("home.modules.title")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">{t("home.modules.subtitle")}</p>
          <div className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ icon: Icon, key }) => (
              <div key={key}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-night/5">
                  <Icon className="h-5 w-5 text-brand-night" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-semibold text-slate-900">{t(key)}</h3>
                <p className="mt-1 text-sm text-slate-600">{t(`${key}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hors connexion et installation */}
      <section id="hors-connexion" className="bg-brand-night">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal">
              {t("home.offline.eyebrow")}
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold text-white">{t("home.offline.title")}</h2>
            <p className="mt-4 max-w-2xl text-white/70">{t("home.offline.subtitle")}</p>
            <ul className="mt-8 space-y-4">
              {OFFLINE_POINTS.map((key) => (
                <li key={key} className="flex gap-3 text-white/90">
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal" aria-hidden="true" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-white/60">{t("home.offline.limit")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <InstallAppButton className="flex items-center gap-2 rounded-md bg-brand-teal px-5 py-2.5 text-sm font-semibold text-brand-night transition hover:brightness-110" />
              <Link
                to="/guide#utilisation-hors-connexion"
                className="text-sm font-medium text-white underline decoration-brand-teal underline-offset-4"
              >
                {t("home.offline.guideLink")}
              </Link>
            </div>
          </div>
          <OfflinePhonePreview />
        </div>
      </section>

      {/* Atouts */}
      <section className="bg-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-slate-900">{t("home.features.title")}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURE_CARDS.map(({ icon: Icon, titleKey, descriptionKey }) => (
              <div key={titleKey} className="flex gap-4 rounded-lg bg-white p-6 shadow-sm">
                <Icon className="h-6 w-6 shrink-0 text-brand-gold" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{t(titleKey)}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t(descriptionKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Démarrage */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-slate-900">{t("home.steps.title")}</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step} className="rounded-lg border border-slate-200 bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-night text-sm font-bold text-white">
                {step}
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{t(`home.steps.${step}.title`)}</h3>
              <p className="mt-1 text-sm text-slate-600">{t(`home.steps.${step}.description`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Tarifs en bref */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 sm:p-10">
            <h2 className="text-2xl font-semibold text-slate-900">{t("home.pricing.title")}</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">{t("home.pricing.school")}</p>
                <p className="mt-1 text-2xl font-bold text-brand-night sm:text-3xl">
                  {t("home.pricing.schoolPrice")}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("home.pricing.family")}</p>
                <p className="mt-1 text-2xl font-bold text-brand-night sm:text-3xl">
                  {t("home.pricing.familyPrice")}
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm text-slate-600">{t("home.pricing.note")}</p>
            <p className="mt-1 text-sm text-slate-600">{t("home.pricing.localNote")}</p>
            <Link to="/tarifs" className="mt-6 inline-block">
              <Button variant="primary">{t("home.pricing.cta")}</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Questions fréquentes */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-slate-900">{t("home.faq.title")}</h2>
        <div className="mt-8 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {FAQ.map((key) => (
            <details key={key} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                {t(`home.faq.${key}.q`)}
                <span
                  className="text-brand-teal transition-transform group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{t(`home.faq.${key}.a`)}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center">
          <Link
            to="/guide"
            className="text-sm font-semibold text-brand-night underline decoration-brand-teal underline-offset-4"
          >
            {t("home.faq.guideLink")}
          </Link>
        </p>
      </section>

      {/* Appel à l'action */}
      <section className="bg-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">{t("home.cta.title")}</h2>
          <p className="mt-2 text-slate-600">{t("home.cta.subtitle")}</p>
          <Link to="/inscription" className="mt-6 inline-block">
            <Button variant="secondary">{t("home.cta.button")}</Button>
          </Link>
        </div>
      </section>
    </>
  );
}
