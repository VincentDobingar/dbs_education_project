// §17 : catalogue de référence global (CatalogItem) proposé à tous les établissements
// dans Configuration. Base : système francophone d'Afrique centrale et de l'Ouest
// (Tchad, Cameroun francophone, Gabon, Congo, Côte d'Ivoire, Sénégal…). Chaque
// établissement importe ce qui le concerne et peut toujours ajouter ses propres
// éléments ; la super-administration complète ce catalogue au fil de l'eau.
//
// `order` des niveaux : numérotation continue d'un cycle à l'autre, pour que le tri
// et la progression (passage en classe supérieure) restent sans ambiguïté.

type CatalogSeed = {
  kind: "EDUCATION_CYCLE" | "GRADE_LEVEL" | "SUBJECT" | "ASSESSMENT_TYPE" | "FEE_CATEGORY";
  code: string;
  nameFr: string;
  nameEn: string;
  order: number;
  parentCode?: string;
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

export const CATALOG_ITEMS: readonly CatalogSeed[] = [
  ...cycles,
  ...gradeLevels,
  ...subjects,
  ...assessmentTypes,
  ...feeCategories,
];
