import enApp from "./locales/en/app.json" with { type: "json" };
import enCommon from "./locales/en/common.json" with { type: "json" };
import enMarketing from "./locales/en/marketing.json" with { type: "json" };
import frApp from "./locales/fr/app.json" with { type: "json" };
import frCommon from "./locales/fr/common.json" with { type: "json" };
import frMarketing from "./locales/fr/marketing.json" with { type: "json" };

export const defaultLocale = "fr" as const;
export const supportedLocales = ["fr", "en"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const resources = {
  fr: { common: frCommon, marketing: frMarketing, app: frApp },
  en: { common: enCommon, marketing: enMarketing, app: enApp },
} as const satisfies Record<
  SupportedLocale,
  { common: Record<string, string>; marketing: Record<string, string>; app: Record<string, string> }
>;
