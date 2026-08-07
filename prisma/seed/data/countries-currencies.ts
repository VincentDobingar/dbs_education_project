export const CURRENCIES = [
  {
    isoCode: "XAF",
    nameFr: "Franc CFA (BEAC)",
    nameEn: "Central African CFA Franc",
    symbol: "FCFA",
    decimalDigits: 0,
  },
  {
    isoCode: "XOF",
    nameFr: "Franc CFA (BCEAO)",
    nameEn: "West African CFA Franc",
    symbol: "FCFA",
    decimalDigits: 0,
  },
  { isoCode: "KES", nameFr: "Shilling kenyan", nameEn: "Kenyan Shilling", symbol: "KSh", decimalDigits: 2 },
  {
    isoCode: "TZS",
    nameFr: "Shilling tanzanien",
    nameEn: "Tanzanian Shilling",
    symbol: "TSh",
    decimalDigits: 2,
  },
  {
    isoCode: "UGX",
    nameFr: "Shilling ougandais",
    nameEn: "Ugandan Shilling",
    symbol: "USh",
    decimalDigits: 0,
  },
  { isoCode: "USD", nameFr: "Dollar americain", nameEn: "US Dollar", symbol: "$", decimalDigits: 2 },
] as const;

// Priorite MVP validee : Afrique centrale (CEMAC) + Afrique de l'Est d'abord, UEMOA ensuite.
export const COUNTRIES = [
  { isoCode: "CM", nameFr: "Cameroun", nameEn: "Cameroon", phoneCallingCode: "+237", defaultCurrency: "XAF" },
  { isoCode: "GA", nameFr: "Gabon", nameEn: "Gabon", phoneCallingCode: "+241", defaultCurrency: "XAF" },
  { isoCode: "CG", nameFr: "Congo", nameEn: "Congo", phoneCallingCode: "+242", defaultCurrency: "XAF" },
  { isoCode: "TD", nameFr: "Tchad", nameEn: "Chad", phoneCallingCode: "+235", defaultCurrency: "XAF" },
  { isoCode: "KE", nameFr: "Kenya", nameEn: "Kenya", phoneCallingCode: "+254", defaultCurrency: "KES" },
  { isoCode: "TZ", nameFr: "Tanzanie", nameEn: "Tanzania", phoneCallingCode: "+255", defaultCurrency: "TZS" },
  { isoCode: "UG", nameFr: "Ouganda", nameEn: "Uganda", phoneCallingCode: "+256", defaultCurrency: "UGX" },
  {
    isoCode: "CI",
    nameFr: "Cote d'Ivoire",
    nameEn: "Ivory Coast",
    phoneCallingCode: "+225",
    defaultCurrency: "XOF",
  },
  { isoCode: "SN", nameFr: "Senegal", nameEn: "Senegal", phoneCallingCode: "+221", defaultCurrency: "XOF" },
] as const;
