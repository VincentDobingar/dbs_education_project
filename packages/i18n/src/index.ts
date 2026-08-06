import enCommon from "./locales/en/common.json" with { type: "json" };
import frCommon from "./locales/fr/common.json" with { type: "json" };

export const defaultLocale = "fr" as const;
export const supportedLocales = ["fr", "en"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const resources = {
  fr: { common: frCommon },
  en: { common: enCommon },
} as const satisfies Record<SupportedLocale, { common: Record<string, string> }>;
