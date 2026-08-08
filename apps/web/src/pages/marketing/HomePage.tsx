import { Button } from "@edumanage/ui";
import { GraduationCap, ShieldCheck, Smartphone, Users, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const AUDIENCE_CARDS = [
  {
    icon: GraduationCap,
    titleKey: "home.audience.school.title",
    descriptionKey: "home.audience.school.description",
  },
  { icon: Users, titleKey: "home.audience.parent.title", descriptionKey: "home.audience.parent.description" },
  {
    icon: ShieldCheck,
    titleKey: "home.audience.student.title",
    descriptionKey: "home.audience.student.description",
  },
] as const;

const FEATURE_CARDS = [
  {
    icon: ShieldCheck,
    titleKey: "home.features.multitenant.title",
    descriptionKey: "home.features.multitenant.description",
  },
  {
    icon: Smartphone,
    titleKey: "home.features.payments.title",
    descriptionKey: "home.features.payments.description",
  },
  {
    icon: WifiOff,
    titleKey: "home.features.offline.title",
    descriptionKey: "home.features.offline.description",
  },
  {
    icon: Users,
    titleKey: "home.features.multilingual.title",
    descriptionKey: "home.features.multilingual.description",
  },
] as const;

export function HomePage(): ReactNode {
  const { t } = useTranslation("marketing");

  return (
    <>
      <section className="bg-brand-night">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
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
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-slate-900">{t("home.audience.title")}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {AUDIENCE_CARDS.map(({ icon: Icon, titleKey, descriptionKey }) => (
            <div key={titleKey} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <Icon className="h-8 w-8 text-brand-teal" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(titleKey)}</h3>
              <p className="mt-2 text-sm text-slate-600">{t(descriptionKey)}</p>
            </div>
          ))}
        </div>
      </section>

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

      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold text-slate-900">{t("home.cta.title")}</h2>
        <p className="mt-2 text-slate-600">{t("home.cta.subtitle")}</p>
        <Link to="/inscription" className="mt-6 inline-block">
          <Button variant="secondary">{t("home.cta.button")}</Button>
        </Link>
      </section>
    </>
  );
}
