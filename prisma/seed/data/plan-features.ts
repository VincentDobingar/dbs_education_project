// Catalogue de fonctionnalités indicatif — à affiner module par module au fur et
// à mesure des phases qui les implémentent réellement (Phase 5+).
export const PLAN_FEATURES: readonly {
  planCode: string;
  featureCode: string;
  isIncluded: boolean;
  quotaLimit: number | null;
}[] = [
  { planCode: "SCHOOL_ESSENTIAL", featureCode: "report_card.download", isIncluded: true, quotaLimit: null },
  { planCode: "SCHOOL_ESSENTIAL", featureCode: "sms.notifications", isIncluded: true, quotaLimit: 200 },
  {
    planCode: "SCHOOL_PROFESSIONAL",
    featureCode: "report_card.download",
    isIncluded: true,
    quotaLimit: null,
  },
  { planCode: "SCHOOL_PROFESSIONAL", featureCode: "sms.notifications", isIncluded: true, quotaLimit: 1000 },
  { planCode: "SCHOOL_PREMIUM", featureCode: "report_card.download", isIncluded: true, quotaLimit: null },
  { planCode: "SCHOOL_PREMIUM", featureCode: "sms.notifications", isIncluded: true, quotaLimit: 5000 },
  { planCode: "PARENT_BASIC", featureCode: "report_card.download", isIncluded: true, quotaLimit: 12 },
  { planCode: "PARENT_PREMIUM", featureCode: "report_card.download", isIncluded: true, quotaLimit: null },
  { planCode: "FAMILY_PLAN", featureCode: "report_card.download", isIncluded: true, quotaLimit: null },
  { planCode: "STUDENT_BASIC", featureCode: "report_card.download", isIncluded: true, quotaLimit: 12 },
  { planCode: "STUDENT_PREMIUM", featureCode: "report_card.download", isIncluded: true, quotaLimit: null },
];
