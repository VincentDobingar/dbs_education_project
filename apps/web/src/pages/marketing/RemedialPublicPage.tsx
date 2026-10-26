import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { RemedialCatalog } from "../../components/RemedialCatalog.js";

/** Site public : catalogue consultable sans compte, inscription via le portail famille. */
export function RemedialPublicPage(): ReactNode {
  const { t } = useTranslation("app");
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal">
          {t("remedial.public.eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{t("remedial.public.title")}</h1>
        <p className="mt-3 text-slate-600">{t("remedial.public.subtitle")}</p>
      </div>
      <RemedialCatalog
        renderAction={(offer) =>
          offer.seatsLeft > 0 ? (
            <Link
              to="/portail/connexion"
              className="text-sm font-semibold text-brand-night hover:text-brand-teal"
            >
              {t("remedial.public.signIn")} →
            </Link>
          ) : null
        }
      />
    </div>
  );
}
