import { supportedLocales, type SupportedLocale } from "@edumanage/i18n";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: "FR",
  en: "EN",
};

export function LanguageSwitcher(): ReactNode {
  const { i18n } = useTranslation();
  const current = i18n.language.slice(0, 2) as SupportedLocale;

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/20 p-1 text-xs font-medium">
      {supportedLocales.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => void i18n.changeLanguage(locale)}
          aria-pressed={current === locale}
          className={`rounded-full px-2 py-1 transition-colors ${
            current === locale ? "bg-brand-teal text-brand-night" : "text-white/70 hover:text-white"
          }`}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
