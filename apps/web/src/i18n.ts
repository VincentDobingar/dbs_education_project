import { defaultLocale, resources, supportedLocales } from "@edumanage/i18n";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: defaultLocale,
    supportedLngs: supportedLocales,
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });

export default i18next;
