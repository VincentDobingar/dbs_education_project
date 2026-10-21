import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { GuideArticle } from "../../components/GuideArticle.js";
import guideSource from "../../content/guide-utilisateur.md?raw";
import { GUIDE_PDF_HREF } from "../../lib/guide.js";

/**
 * Le même guide que la page publique /guide, affiché dans l'espace connecté
 * (établissement ou portail) pour ne pas faire sortir l'utilisateur de son menu.
 */
export function HelpPage(): ReactNode {
  const { t } = useTranslation("app");

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{t("guide.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("guide.subtitle")}</p>
      </div>
      <GuideArticle source={guideSource} pdfHref={GUIDE_PDF_HREF} />
    </div>
  );
}
