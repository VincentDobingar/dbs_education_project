import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { GuideArticle } from "../../components/GuideArticle.js";
import guideSource from "../../content/guide-utilisateur.md?raw";
import { GUIDE_PDF_HREF } from "../../lib/guide.js";

/** Guide d'utilisation public : accessible sans compte, depuis le site vitrine. */
export function GuidePage(): ReactNode {
  const { t } = useTranslation("app");

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold">{t("guide.kicker")}</p>
        <h1 className="mt-2 text-3xl font-bold text-brand-night sm:text-4xl">{t("guide.title")}</h1>
        <p className="mt-3 max-w-2xl text-slate-600">{t("guide.subtitle")}</p>
      </header>
      <GuideArticle source={guideSource} pdfHref={GUIDE_PDF_HREF} />
    </div>
  );
}
