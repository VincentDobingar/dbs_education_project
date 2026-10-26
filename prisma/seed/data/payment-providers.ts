// Priorite MVP validee (§0 architecture) : Afrique centrale + Afrique de l'Est
// d'abord. Tous en mode test tant qu'aucun contrat operateur n'est signe.
export const PAYMENT_PROVIDERS = [
  {
    code: "ORANGE_MONEY_CM",
    nameFr: "Orange Money Cameroun",
    nameEn: "Orange Money Cameroon",
    countryIso: "CM",
    methodType: "MOBILE_MONEY",
  },
  {
    code: "MTN_MOMO_CM",
    nameFr: "MTN Mobile Money Cameroun",
    nameEn: "MTN Mobile Money Cameroon",
    countryIso: "CM",
    methodType: "MOBILE_MONEY",
  },
  {
    code: "AIRTEL_MONEY_CG",
    nameFr: "Airtel Money Congo",
    nameEn: "Airtel Money Congo",
    countryIso: "CG",
    methodType: "MOBILE_MONEY",
  },
  {
    code: "MPESA_KE",
    nameFr: "M-Pesa Kenya",
    nameEn: "M-Pesa Kenya",
    countryIso: "KE",
    methodType: "MOBILE_MONEY",
  },
  {
    code: "MTN_MOMO_UG",
    nameFr: "MTN Mobile Money Ouganda",
    nameEn: "MTN Mobile Money Uganda",
    countryIso: "UG",
    methodType: "MOBILE_MONEY",
  },
  // Konoom : établissement de paiement agréé COBAC (Tchad 2025, Cameroun 2026).
  // Actif côté plateforme seulement quand ses identifiants sont configurés
  // (apps/api/src/lib/payment-channels.ts).
  {
    code: "KONOOM_TD",
    nameFr: "Konoom Tchad",
    nameEn: "Konoom Chad",
    countryIso: "TD",
    methodType: "WALLET",
  },
  {
    code: "KONOOM_CM",
    nameFr: "Konoom Cameroun",
    nameEn: "Konoom Cameroon",
    countryIso: "CM",
    methodType: "WALLET",
  },
  {
    code: "CASH_AGENT",
    nameFr: "Espèces (agent autorisé)",
    nameEn: "Cash (authorized agent)",
    countryIso: null,
    methodType: "CASH",
  },
] as const;
