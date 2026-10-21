import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { GuideArticle } from "../../components/GuideArticle.js";
import guideSource from "../../content/guide-administration.md?raw";

/** Guide réservé à l'équipe DBS Africa : super-administration, données de démonstration. */
export function AdminGuidePage(): ReactNode {
  const { t } = useTranslation("app");

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.guide.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.guide.subtitle")}</p>
      </div>
      <GuideArticle source={guideSource} />
    </div>
  );
}
