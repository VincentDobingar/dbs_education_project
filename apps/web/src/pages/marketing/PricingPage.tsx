import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const SCHOOL_PLANS = ["SCHOOL_ESSENTIAL", "SCHOOL_PROFESSIONAL", "SCHOOL_PREMIUM"] as const;
const PARENT_PLANS = ["PARENT_BASIC", "PARENT_PREMIUM", "FAMILY_PLAN"] as const;
const STUDENT_PLANS = ["STUDENT_BASIC", "STUDENT_PREMIUM"] as const;

function PlanGrid({ planCodes }: { planCodes: readonly string[] }): ReactNode {
  const { t } = useTranslation("marketing");

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {planCodes.map((code) => (
        <div key={code} className="flex flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{t(`pricing.plan.${code}.name`)}</h3>
          <p className="mt-2 flex-1 text-sm text-slate-600">{t(`pricing.plan.${code}.description`)}</p>
        </div>
      ))}
    </div>
  );
}

export function PricingPage(): ReactNode {
  const { t } = useTranslation("marketing");

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">{t("pricing.title")}</h1>
        <p className="mt-2 text-slate-600">{t("pricing.subtitle")}</p>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-slate-900">{t("pricing.school.title")}</h2>
        <div className="mt-6">
          <PlanGrid planCodes={SCHOOL_PLANS} />
        </div>
        <p className="mt-4 text-sm text-slate-500">{t("pricing.contactSales")}</p>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold text-slate-900">{t("pricing.parent.title")}</h2>
        <div className="mt-6">
          <PlanGrid planCodes={PARENT_PLANS} />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold text-slate-900">{t("pricing.student.title")}</h2>
        <div className="mt-6">
          <PlanGrid planCodes={STUDENT_PLANS} />
        </div>
      </section>

      <div className="mt-16 text-center">
        <Link to="/inscription" className="text-brand-teal underline">
          {t("nav.subscribe")}
        </Link>
      </div>
    </div>
  );
}
