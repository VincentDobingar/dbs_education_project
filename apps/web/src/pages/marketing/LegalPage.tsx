import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface LegalPageProps {
  titleKey: string;
  introKey: string;
}

export function LegalPage({ titleKey, introKey }: LegalPageProps): ReactNode {
  const { t } = useTranslation("marketing");

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t(titleKey)}</h1>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        {t("legal.draftNotice")}
      </p>
      <p className="mt-6 text-slate-700">{t(introKey)}</p>
    </div>
  );
}
