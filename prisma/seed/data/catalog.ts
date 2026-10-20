// §17 : catalogue de référence global (CatalogItem) proposé à tous les établissements
// dans Configuration. Base : système francophone d'Afrique centrale et de l'Ouest
// (Tchad, Cameroun francophone, Gabon, Congo, Côte d'Ivoire, Sénégal…). Chaque
// établissement importe ce qui le concerne et peut toujours ajouter ses propres
// éléments ; la super-administration complète ce catalogue au fil de l'eau.
//
// `order` des niveaux : numérotation continue d'un cycle à l'autre, pour que le tri
// et la progression (passage en classe supérieure) restent sans ambiguïté.

type CatalogSeed = {
  kind:
    | "EDUCATION_CYCLE"
    | "GRADE_LEVEL"
    | "SUBJECT"
    | "ASSESSMENT_TYPE"
    | "FEE_CATEGORY"
    | "CAMPUS"
    | "ROOM"
    | "HOLIDAY";
  code: string;
  nameFr: string;
  nameEn: string;
  order: number;
  parentCode?: string;
  countryIsoCode?: string;
  month?: number;
  day?: number;
};

const cycles: CatalogSeed[] = [
  {
    kind: "EDUCATION_CYCLE",
    code: "PRESCO",
    nameFr: "Préscolaire (maternelle)",
    nameEn: "Pre-school",
    order: 1,
  },
  { kind: "EDUCATION_CYCLE", code: "PRIM", nameFr: "Primaire", nameEn: "Primary", order: 2 },
  {
    kind: "EDUCATION_CYCLE",
    code: "MOYEN",
    nameFr: "Enseignement moyen (collège)",
    nameEn: "Lower secondary",
    order: 3,
  },
  {
    kind: "EDUCATION_CYCLE",
    code: "SEC",
    nameFr: "Enseignement secondaire (lycée)",
    nameEn: "Upper secondary",
    order: 4,
  },
  {
    kind: "EDUCATION_CYCLE",
    code: "SUP",
    nameFr: "Enseignement supérieur",
    nameEn: "Higher education",
    order: 5,
  },
];

const level = (
  parentCode: string,
  code: string,
  nameFr: string,
  nameEn: string,
  order: number,
): CatalogSeed => ({ kind: "GRADE_LEVEL", parentCode, code, nameFr, nameEn, order });

const gradeLevels: CatalogSeed[] = [
  level("PRESCO", "PS", "Petite section", "Nursery 1", 1),
  level("PRESCO", "MS", "Moyenne section", "Nursery 2", 2),
  level("PRESCO", "GS", "Grande section", "Nursery 3", 3),
  level("PRIM", "CP1", "Cours préparatoire 1", "Primary 1", 4),
  level("PRIM", "CP2", "Cours préparatoire 2", "Primary 2", 5),
  level("PRIM", "CE1", "Cours élémentaire 1", "Primary 3", 6),
  level("PRIM", "CE2", "Cours élémentaire 2", "Primary 4", 7),
  level("PRIM", "CM1", "Cours moyen 1", "Primary 5", 8),
  level("PRIM", "CM2", "Cours moyen 2", "Primary 6", 9),
  level("MOYEN", "6E", "Sixième", "Grade 7", 10),
  level("MOYEN", "5E", "Cinquième", "Grade 8", 11),
  level("MOYEN", "4E", "Quatrième", "Grade 9", 12),
  level("MOYEN", "3E", "Troisième", "Grade 10", 13),
  level("SEC", "2ND", "Seconde", "Grade 11", 14),
  level("SEC", "1ERE", "Première", "Grade 12", 15),
  level("SEC", "TLE", "Terminale", "Grade 13", 16),
  level("SUP", "L1", "Licence 1", "Bachelor year 1", 17),
  level("SUP", "L2", "Licence 2", "Bachelor year 2", 18),
  level("SUP", "L3", "Licence 3", "Bachelor year 3", 19),
  level("SUP", "M1", "Master 1", "Master year 1", 20),
  level("SUP", "M2", "Master 2", "Master year 2", 21),
];

const simple = (
  kind: CatalogSeed["kind"],
  entries: readonly (readonly [code: string, nameFr: string, nameEn: string])[],
): CatalogSeed[] =>
  entries.map(([code, nameFr, nameEn], index) => ({ kind, code, nameFr, nameEn, order: index + 1 }));

const subjects = simple("SUBJECT", [
  ["FR", "Français", "French"],
  ["MATH", "Mathématiques", "Mathematics"],
  ["ANG", "Anglais", "English"],
  ["AR", "Arabe", "Arabic"],
  ["SVT", "Sciences de la vie et de la Terre", "Life and Earth sciences"],
  ["PC", "Physique-Chimie", "Physics and Chemistry"],
  ["HG", "Histoire-Géographie", "History and Geography"],
  ["ECM", "Éducation civique et morale", "Civic and moral education"],
  ["PHILO", "Philosophie", "Philosophy"],
  ["EPS", "Éducation physique et sportive", "Physical education"],
  ["INFO", "Informatique (TIC)", "Computer science (ICT)"],
  ["ECO", "Économie", "Economics"],
  ["ALL", "Allemand", "German"],
  ["ESP", "Espagnol", "Spanish"],
  ["LAT", "Latin", "Latin"],
  ["ART", "Arts plastiques / Dessin", "Visual arts / Drawing"],
  ["MUS", "Éducation musicale", "Music"],
  ["REL", "Éducation religieuse", "Religious education"],
  ["LECT", "Lecture", "Reading"],
  ["ECR", "Écriture", "Writing"],
  ["CALC", "Calcul", "Arithmetic"],
  ["SCOBS", "Sciences d'observation", "Observation sciences"],
  ["LANGN", "Langue nationale", "National language"],
  ["TM", "Travaux manuels", "Handicrafts"],
]);

const assessmentTypes = simple("ASSESSMENT_TYPE", [
  ["INTERRO", "Interrogation écrite", "Written quiz"],
  ["DEVOIR", "Devoir surveillé", "Supervised test"],
  ["COMPO", "Composition", "Term examination"],
  ["EXBLANC", "Examen blanc", "Mock examination"],
  ["ORAL", "Évaluation orale", "Oral assessment"],
  ["TP", "Travaux pratiques", "Practical work"],
  ["PROJET", "Projet / exposé", "Project / presentation"],
  ["DM", "Devoir à la maison", "Homework assignment"],
]);

const feeCategories = simple("FEE_CATEGORY", [
  ["INSCRIPTION", "Frais d'inscription", "Registration fee"],
  ["REINSCRIPTION", "Frais de réinscription", "Re-registration fee"],
  ["SCOLARITE", "Frais de scolarité", "Tuition fee"],
  ["APE", "Cotisation APE (parents d'élèves)", "Parents' association fee"],
  ["EXAMEN", "Frais d'examen", "Examination fee"],
  ["TENUE", "Tenue scolaire", "School uniform"],
  ["FOURNITURES", "Fournitures scolaires", "School supplies"],
  ["ASSURANCE", "Assurance scolaire", "School insurance"],
  ["TRANSPORT", "Transport scolaire", "School transport"],
  ["CANTINE", "Cantine", "Canteen"],
  ["INTERNAT", "Internat", "Boarding"],
  ["ACTIVITES", "Activités parascolaires", "Extracurricular activities"],
  ["BIBLIO", "Bibliothèque", "Library"],
]);

const campuses = simple("CAMPUS", [
  ["PRINCIPAL", "Campus principal", "Main campus"],
  ["ANNEXE", "Annexe", "Annex"],
  ["MATERNELLE", "Site maternelle", "Pre-school site"],
  ["PRIMAIRE", "Site primaire", "Primary site"],
  ["COLLEGE", "Site collège", "Lower secondary site"],
  ["LYCEE", "Site lycée", "Upper secondary site"],
]);

// Salles spécialisées — les salles de classe numérotées se génèrent à part
// (« Salle 1 » à « Salle N ») depuis Configuration.
const rooms = simple("ROOM", [
  ["LABO_SCIENCES", "Laboratoire de sciences", "Science laboratory"],
  ["SALLE_INFO", "Salle informatique", "Computer room"],
  ["BIBLIOTHEQUE", "Bibliothèque", "Library"],
  ["SALLE_PROFS", "Salle des professeurs", "Staff room"],
  ["SALLE_POLY", "Salle polyvalente", "Multipurpose hall"],
  ["GYMNASE", "Gymnase / salle de sport", "Gymnasium"],
  ["REFECTOIRE", "Réfectoire", "Dining hall"],
  ["INFIRMERIE", "Infirmerie", "Infirmary"],
  ["SALLE_MUSIQUE", "Salle de musique", "Music room"],
  ["ATELIER", "Atelier", "Workshop"],
  ["SALLE_REUNION", "Salle de réunion", "Meeting room"],
  ["SALLE_EXAMEN", "Salle d'examen", "Examination hall"],
]);

// Jours fériés à DATE FIXE uniquement : les fêtes mobiles (Pâques, Ascension,
// Pentecôte, Aïd el-Fitr, Aïd el-Adha, Maouloud…) changent chaque année et restent
// saisies par l'établissement. À vérifier/compléter depuis la super-administration
// si un pays modifie son calendrier officiel.
const holidaysByCountry: Record<string, readonly (readonly [string, string, string, number, number])[]> = {
  TD: [
    ["NOUVEL_AN", "Jour de l'an", "New Year's Day", 1, 1],
    ["FEMME", "Journée internationale de la femme", "International Women's Day", 3, 8],
    ["TRAVAIL", "Fête du travail", "Labour Day", 5, 1],
    ["AFRIQUE", "Journée de l'Afrique", "Africa Day", 5, 25],
    ["INDEPENDANCE", "Fête de l'indépendance", "Independence Day", 8, 11],
    ["TOUSSAINT", "Toussaint", "All Saints' Day", 11, 1],
    ["REPUBLIQUE", "Proclamation de la République", "Republic Day", 11, 28],
    ["LIBERTE", "Journée de la liberté et de la démocratie", "Freedom and Democracy Day", 12, 1],
    ["NOEL", "Noël", "Christmas Day", 12, 25],
  ],
  CM: [
    ["NOUVEL_AN", "Jour de l'an", "New Year's Day", 1, 1],
    ["JEUNESSE", "Fête de la jeunesse", "Youth Day", 2, 11],
    ["TRAVAIL", "Fête du travail", "Labour Day", 5, 1],
    ["NATIONALE", "Fête nationale", "National Day", 5, 20],
    ["ASSOMPTION", "Assomption", "Assumption Day", 8, 15],
    ["NOEL", "Noël", "Christmas Day", 12, 25],
  ],
  GA: [
    ["NOUVEL_AN", "Jour de l'an", "New Year's Day", 1, 1],
    ["FEMME", "Journée des droits de la femme", "Women's Rights Day", 4, 17],
    ["TRAVAIL", "Fête du travail", "Labour Day", 5, 1],
    ["ASSOMPTION", "Assomption", "Assumption Day", 8, 15],
    ["INDEPENDANCE_1", "Fête de l'indépendance", "Independence Day", 8, 16],
    ["INDEPENDANCE_2", "Fête de l'indépendance (2e jour)", "Independence Day (day 2)", 8, 17],
    ["TOUSSAINT", "Toussaint", "All Saints' Day", 11, 1],
    ["NOEL", "Noël", "Christmas Day", 12, 25],
  ],
  CG: [
    ["NOUVEL_AN", "Jour de l'an", "New Year's Day", 1, 1],
    ["TRAVAIL", "Fête du travail", "Labour Day", 5, 1],
    ["RECONCILIATION", "Fête de la réconciliation", "Reconciliation Day", 6, 10],
    ["NATIONALE", "Fête nationale", "National Day", 8, 15],
    ["TOUSSAINT", "Toussaint", "All Saints' Day", 11, 1],
    ["REPUBLIQUE", "Proclamation de la République", "Republic Day", 11, 28],
    ["NOEL", "Noël", "Christmas Day", 12, 25],
  ],
  CI: [
    ["NOUVEL_AN", "Jour de l'an", "New Year's Day", 1, 1],
    ["TRAVAIL", "Fête du travail", "Labour Day", 5, 1],
    ["INDEPENDANCE", "Fête de l'indépendance", "Independence Day", 8, 7],
    ["ASSOMPTION", "Assomption", "Assumption Day", 8, 15],
    ["TOUSSAINT", "Toussaint", "All Saints' Day", 11, 1],
    ["PAIX", "Journée nationale de la paix", "National Peace Day", 11, 15],
    ["NOEL", "Noël", "Christmas Day", 12, 25],
  ],
  SN: [
    ["NOUVEL_AN", "Jour de l'an", "New Year's Day", 1, 1],
    ["INDEPENDANCE", "Fête de l'indépendance", "Independence Day", 4, 4],
    ["TRAVAIL", "Fête du travail", "Labour Day", 5, 1],
    ["ASSOMPTION", "Assomption", "Assumption Day", 8, 15],
    ["TOUSSAINT", "Toussaint", "All Saints' Day", 11, 1],
    ["NOEL", "Noël", "Christmas Day", 12, 25],
  ],
  KE: [
    ["NEW_YEAR", "Jour de l'an", "New Year's Day", 1, 1],
    ["LABOUR", "Fête du travail", "Labour Day", 5, 1],
    ["MADARAKA", "Madaraka Day", "Madaraka Day", 6, 1],
    ["MAZINGIRA", "Mazingira Day", "Mazingira Day", 10, 10],
    ["MASHUJAA", "Mashujaa Day", "Mashujaa Day", 10, 20],
    ["JAMHURI", "Jamhuri Day", "Jamhuri Day", 12, 12],
    ["CHRISTMAS", "Noël", "Christmas Day", 12, 25],
    ["BOXING", "Boxing Day", "Boxing Day", 12, 26],
  ],
  TZ: [
    ["NEW_YEAR", "Jour de l'an", "New Year's Day", 1, 1],
    ["ZANZIBAR", "Révolution de Zanzibar", "Zanzibar Revolution Day", 1, 12],
    ["KARUME", "Karume Day", "Karume Day", 4, 7],
    ["UNION", "Fête de l'Union", "Union Day", 4, 26],
    ["LABOUR", "Fête du travail", "Labour Day", 5, 1],
    ["SABA_SABA", "Saba Saba", "Saba Saba Day", 7, 7],
    ["NANE_NANE", "Nane Nane", "Nane Nane Day", 8, 8],
    ["NYERERE", "Nyerere Day", "Nyerere Day", 10, 14],
    ["INDEPENDENCE", "Fête de l'indépendance", "Independence Day", 12, 9],
    ["CHRISTMAS", "Noël", "Christmas Day", 12, 25],
    ["BOXING", "Boxing Day", "Boxing Day", 12, 26],
  ],
  UG: [
    ["NEW_YEAR", "Jour de l'an", "New Year's Day", 1, 1],
    ["LIBERATION", "Journée de la libération", "Liberation Day", 1, 26],
    ["JANANI_LUWUM", "Janani Luwum Day", "Janani Luwum Day", 2, 16],
    ["WOMEN", "Journée internationale de la femme", "International Women's Day", 3, 8],
    ["LABOUR", "Fête du travail", "Labour Day", 5, 1],
    ["MARTYRS", "Journée des martyrs", "Martyrs' Day", 6, 3],
    ["HEROES", "Journée des héros", "Heroes' Day", 6, 9],
    ["INDEPENDENCE", "Fête de l'indépendance", "Independence Day", 10, 9],
    ["CHRISTMAS", "Noël", "Christmas Day", 12, 25],
    ["BOXING", "Boxing Day", "Boxing Day", 12, 26],
  ],
};

const holidays: CatalogSeed[] = Object.entries(holidaysByCountry).flatMap(([countryIsoCode, entries]) =>
  entries.map(([code, nameFr, nameEn, month, day], index) => ({
    kind: "HOLIDAY" as const,
    code: `${countryIsoCode}_${code}`,
    nameFr,
    nameEn,
    order: index + 1,
    countryIsoCode,
    month,
    day,
  })),
);

export const CATALOG_ITEMS: readonly CatalogSeed[] = [
  ...cycles,
  ...gradeLevels,
  ...subjects,
  ...assessmentTypes,
  ...feeCategories,
  ...campuses,
  ...rooms,
  ...holidays,
];
