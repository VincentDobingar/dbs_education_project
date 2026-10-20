// Générateur PUR des données de démonstration (aucun accès base) : structure
// scolaire, élèves, personnel, affectations et emplois du temps. Séparé de
// l'écriture (demo-school.ts) pour pouvoir être vérifié hors base — effectifs,
// volumes horaires, absence de conflit enseignant/classe.

export const DEMO_MARKER = "DEMO";

/** PRNG déterministe (mulberry32) : mêmes données à chaque exécution. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Structure : codes alignés sur le catalogue de référence (prisma/seed/data/catalog.ts)
// ---------------------------------------------------------------------------

export interface LevelPlan {
  code: string;
  cycleCode: "PRIM" | "MOYEN" | "SEC";
  className: string;
  studentCount: number;
  /** Âge typique en début d'année scolaire. */
  age: number;
  /** Heures hebdomadaires par code matière. */
  hours: Record<string, number>;
  /** Coefficients (bulletins) par code matière — secondaire uniquement. */
  coefficients?: Record<string, number>;
}

const PRIMARY_HOURS = { FR: 8, MATH: 6, SCOBS: 3, HG: 2, ECM: 1, AR: 3, EPS: 1 };
const COLLEGE_HOURS = { FR: 5, MATH: 5, ANG: 3, AR: 2, SVT: 2, PC: 2, HG: 3, ECM: 1, EPS: 2, INFO: 1 };
const COLLEGE_COEF = { FR: 3, MATH: 3, ANG: 2, AR: 2, SVT: 2, PC: 2, HG: 2, ECM: 1, EPS: 1, INFO: 1 };
const SECONDE_HOURS = { FR: 4, MATH: 5, ANG: 2, AR: 2, SVT: 3, PC: 4, HG: 2, ECM: 1, EPS: 2, INFO: 1 };
const SECONDE_COEF = { FR: 3, MATH: 4, ANG: 2, AR: 2, SVT: 3, PC: 4, HG: 2, ECM: 1, EPS: 1, INFO: 1 };
// Série D (sciences expérimentales), la plus répandue au Tchad.
const TERMINAL_HOURS = { FR: 3, MATH: 5, ANG: 2, AR: 2, SVT: 4, PC: 4, HG: 2, PHILO: 3, EPS: 2 };
const TERMINAL_COEF = { FR: 2, MATH: 4, ANG: 2, AR: 2, SVT: 5, PC: 4, HG: 2, PHILO: 2, EPS: 1 };

export const LEVELS: readonly LevelPlan[] = [
  { code: "CP1", cycleCode: "PRIM", className: "CP1 A", studentCount: 8, age: 6, hours: PRIMARY_HOURS },
  { code: "CP2", cycleCode: "PRIM", className: "CP2 A", studentCount: 8, age: 7, hours: PRIMARY_HOURS },
  { code: "CE1", cycleCode: "PRIM", className: "CE1 A", studentCount: 8, age: 8, hours: PRIMARY_HOURS },
  { code: "CE2", cycleCode: "PRIM", className: "CE2 A", studentCount: 8, age: 9, hours: PRIMARY_HOURS },
  { code: "CM1", cycleCode: "PRIM", className: "CM1 A", studentCount: 8, age: 10, hours: PRIMARY_HOURS },
  { code: "CM2", cycleCode: "PRIM", className: "CM2 A", studentCount: 8, age: 11, hours: PRIMARY_HOURS },
  {
    code: "6E",
    cycleCode: "MOYEN",
    className: "6e A",
    studentCount: 8,
    age: 12,
    hours: COLLEGE_HOURS,
    coefficients: COLLEGE_COEF,
  },
  {
    code: "5E",
    cycleCode: "MOYEN",
    className: "5e A",
    studentCount: 8,
    age: 13,
    hours: COLLEGE_HOURS,
    coefficients: COLLEGE_COEF,
  },
  {
    code: "4E",
    cycleCode: "MOYEN",
    className: "4e A",
    studentCount: 8,
    age: 14,
    hours: COLLEGE_HOURS,
    coefficients: COLLEGE_COEF,
  },
  {
    code: "3E",
    cycleCode: "MOYEN",
    className: "3e A",
    studentCount: 8,
    age: 15,
    hours: COLLEGE_HOURS,
    coefficients: COLLEGE_COEF,
  },
  {
    code: "2ND",
    cycleCode: "SEC",
    className: "Seconde C",
    studentCount: 7,
    age: 16,
    hours: SECONDE_HOURS,
    coefficients: SECONDE_COEF,
  },
  {
    code: "1ERE",
    cycleCode: "SEC",
    className: "Première D",
    studentCount: 7,
    age: 17,
    hours: TERMINAL_HOURS,
    coefficients: TERMINAL_COEF,
  },
  {
    code: "TLE",
    cycleCode: "SEC",
    className: "Terminale D",
    studentCount: 6,
    age: 18,
    hours: TERMINAL_HOURS,
    coefficients: TERMINAL_COEF,
  },
];

export const SUBJECT_CODES = [
  "FR",
  "MATH",
  "ANG",
  "AR",
  "SVT",
  "PC",
  "HG",
  "ECM",
  "PHILO",
  "EPS",
  "INFO",
  "SCOBS",
] as const;

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------

export interface TeacherPlan {
  number: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  jobTitle: string;
  /** Matières enseignées et classes concernées (codes de niveau). */
  teaches: { subject: string; levels: readonly string[] }[];
}

export interface StaffPlan {
  number: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
}

const PRIMARY_LEVELS = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"] as const;
const COLLEGE_LEVELS = ["6E", "5E", "4E", "3E"] as const;
const LYCEE_LEVELS = ["2ND", "1ERE", "TLE"] as const;
const SECONDARY_LEVELS = [...COLLEGE_LEVELS, ...LYCEE_LEVELS];

const t = (
  index: number,
  firstName: string,
  lastName: string,
  gender: "M" | "F",
  jobTitle: string,
  teaches: TeacherPlan["teaches"],
): TeacherPlan => ({
  number: `${DEMO_MARKER}-ENS-${String(index).padStart(3, "0")}`,
  firstName,
  lastName,
  gender,
  jobTitle,
  teaches,
});

const PRIMARY_CORE = ["FR", "MATH", "SCOBS", "HG", "ECM"];

export const TEACHERS: readonly TeacherPlan[] = [
  // Titulaires du primaire : une classe chacun, matières générales.
  ...[
    ["Achta", "Djimadoum", "F"],
    ["Brahim", "Nodjitoloum", "M"],
    ["Néloumta", "Ngarlejy", "F"],
    ["Moussa", "Abdelkerim", "M"],
    ["Remadji", "Koïbla", "F"],
    ["Adoum", "Béchir", "M"],
  ].map(([firstName, lastName, gender], index) =>
    t(
      index + 1,
      firstName as string,
      lastName as string,
      gender as "M" | "F",
      `Instituteur(trice) titulaire ${PRIMARY_LEVELS[index]}`,
      PRIMARY_CORE.map((subject) => ({ subject, levels: [PRIMARY_LEVELS[index] as string] })),
    ),
  ),
  t(7, "Mahamat", "Youssouf", "M", "Enseignant d'arabe (primaire)", [
    { subject: "AR", levels: PRIMARY_LEVELS },
  ]),
  t(8, "Kaltouma", "Hissein", "F", "Professeure de français (collège)", [
    { subject: "FR", levels: COLLEGE_LEVELS },
  ]),
  t(9, "Ngarta", "Djonga", "M", "Professeur de français (lycée)", [{ subject: "FR", levels: LYCEE_LEVELS }]),
  t(10, "Idriss", "Allahissem", "M", "Professeur de mathématiques (collège)", [
    { subject: "MATH", levels: COLLEGE_LEVELS },
  ]),
  t(11, "Clarisse", "Mbaïlaou", "F", "Professeure de mathématiques (lycée)", [
    { subject: "MATH", levels: LYCEE_LEVELS },
  ]),
  t(12, "Esther", "Ndoubabé", "F", "Professeure d'anglais", [{ subject: "ANG", levels: SECONDARY_LEVELS }]),
  t(13, "Abakar", "Zakaria", "M", "Professeur d'arabe (secondaire)", [
    { subject: "AR", levels: SECONDARY_LEVELS },
  ]),
  t(14, "Grâce", "Kemkoye", "F", "Professeure de SVT", [{ subject: "SVT", levels: SECONDARY_LEVELS }]),
  t(15, "Djibrine", "Doumgor", "M", "Professeur de physique-chimie", [
    { subject: "PC", levels: SECONDARY_LEVELS },
  ]),
  t(16, "Ruth", "Nguéadoum", "F", "Professeure d'histoire-géographie et ECM", [
    { subject: "HG", levels: SECONDARY_LEVELS },
    { subject: "ECM", levels: [...COLLEGE_LEVELS, "2ND"] },
  ]),
  t(17, "Rimtebaye", "Ngoundoum", "M", "Professeur de philosophie", [
    { subject: "PHILO", levels: ["1ERE", "TLE"] },
  ]),
  t(18, "Yaya", "Adam", "M", "Professeur d'EPS", [
    { subject: "EPS", levels: [...PRIMARY_LEVELS, ...SECONDARY_LEVELS] },
  ]),
  t(19, "Nafissa", "Tob", "F", "Professeure d'informatique", [
    { subject: "INFO", levels: [...COLLEGE_LEVELS, "2ND"] },
  ]),
];

export const STAFF: readonly StaffPlan[] = [
  ["Hassan", "Abdelkerim", "Directeur des études"],
  ["Mariam", "Djimtola", "Censeure"],
  ["Oumar", "Saleh", "Surveillant général"],
  ["Halimé", "Mahamat", "Comptable"],
  ["Zara", "Kodbé", "Secrétaire"],
].map(([firstName, lastName, jobTitle], index) => ({
  number: `${DEMO_MARKER}-ADM-${String(index + 1).padStart(3, "0")}`,
  firstName: firstName as string,
  lastName: lastName as string,
  jobTitle: jobTitle as string,
}));

/** Enseignant chargé d'une matière dans une classe (unique par construction). */
export function teacherFor(subject: string, levelCode: string): TeacherPlan {
  const teacher = TEACHERS.find((candidate) =>
    candidate.teaches.some((entry) => entry.subject === subject && entry.levels.includes(levelCode)),
  );
  if (!teacher) throw new Error(`No teacher for ${subject} in ${levelCode}`);
  return teacher;
}

// ---------------------------------------------------------------------------
// Élèves
// ---------------------------------------------------------------------------

const BOY_NAMES = [
  "Mahamat",
  "Abakar",
  "Djimadoum",
  "Ngarta",
  "Moussa",
  "Idriss",
  "Adoum",
  "Brahim",
  "Hassan",
  "Allamine",
  "Nadji",
  "Ndilbé",
  "Yaya",
  "Oumar",
  "Saleh",
  "Djibrine",
  "Ali",
  "Issa",
  "Kodbé",
  "Ahmat",
  "Daniel",
  "Josué",
  "Emmanuel",
  "Mbaïdoum",
];
const GIRL_NAMES = [
  "Achta",
  "Fatimé",
  "Hawa",
  "Mariam",
  "Zara",
  "Khadidja",
  "Halimé",
  "Kaltouma",
  "Néloumta",
  "Remadji",
  "Ndoassal",
  "Mbaïssem",
  "Clarisse",
  "Grâce",
  "Esther",
  "Ruth",
  "Aïcha",
  "Amina",
  "Nafissa",
  "Djénéba",
  "Florence",
  "Rachel",
];
const LAST_NAMES = [
  "Mahamat",
  "Abdelkerim",
  "Ngarlejy",
  "Djimtola",
  "Ndoubabé",
  "Nodjitoloum",
  "Béchir",
  "Hissein",
  "Youssouf",
  "Djonga",
  "Nguéadoum",
  "Mbaïlaou",
  "Koïbla",
  "Allahissem",
  "Doumgor",
  "Tob",
  "Kemkoye",
  "Ngoundoum",
  "Adam",
  "Zakaria",
  "Oumar",
  "Djasra",
  "Ndikwé",
  "Moundou",
  "Baïdessou",
];

export interface StudentPlan {
  matricule: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  dateOfBirth: string;
  levelCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export function buildStudents(schoolYearStart: number, random: () => number): StudentPlan[] {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const students: StudentPlan[] = [];
  const used = new Set<string>();
  let index = 0;
  for (const level of LEVELS) {
    for (let n = 0; n < level.studentCount; n++) {
      index += 1;
      const gender = random() < 0.5 ? "M" : "F";
      let firstName: string;
      let lastName: string;
      do {
        firstName = pick(gender === "M" ? BOY_NAMES : GIRL_NAMES);
        lastName = pick(LAST_NAMES);
      } while (used.has(`${firstName} ${lastName}`));
      used.add(`${firstName} ${lastName}`);

      const birthYear = schoolYearStart - level.age - (random() < 0.25 ? 1 : 0);
      const month = 1 + Math.floor(random() * 12);
      const day = 1 + Math.floor(random() * 28);
      const parentFirst = pick(random() < 0.6 ? BOY_NAMES : GIRL_NAMES);
      const phone = `+235 6${Math.floor(random() * 10)} ${String(Math.floor(random() * 100)).padStart(2, "0")} ${String(Math.floor(random() * 100)).padStart(2, "0")} ${String(Math.floor(random() * 100)).padStart(2, "0")}`;

      students.push({
        matricule: `${DEMO_MARKER}-${schoolYearStart}-${String(index).padStart(3, "0")}`,
        firstName,
        lastName,
        gender,
        dateOfBirth: `${birthYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        levelCode: level.code,
        emergencyContactName: `${parentFirst} ${lastName}`,
        emergencyContactPhone: phone,
      });
    }
  }
  return students;
}

// ---------------------------------------------------------------------------
// Emploi du temps : créneaux d'une heure, lundi → vendredi
// ---------------------------------------------------------------------------

export interface Slot {
  dayOfWeek: number; // 0 = lundi
  startTime: string;
  endTime: string;
}

const MORNING: [string, string][] = [
  ["07:30", "08:30"],
  ["08:30", "09:30"],
  ["09:30", "10:30"],
  ["10:45", "11:45"],
  ["11:45", "12:45"],
];
const AFTERNOON: [string, string][] = [
  ["15:00", "16:00"],
  ["16:00", "17:00"],
];
/** Après-midi les lundi, mardi et jeudi (mercredi et vendredi : matinée seule). */
const AFTERNOON_DAYS = new Set([0, 1, 3]);

export const SLOTS: readonly Slot[] = [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
  [...MORNING, ...(AFTERNOON_DAYS.has(dayOfWeek) ? AFTERNOON : [])].map(([startTime, endTime]) => ({
    dayOfWeek,
    startTime,
    endTime,
  })),
);

export interface LessonPlan {
  levelCode: string;
  subject: string;
  teacherNumber: string;
  slot: Slot;
}

/** Au plus 2 h d'une même matière par jour et par classe. */
const MAX_SAME_SUBJECT_PER_DAY = 2;

/**
 * Placement glouton avec redémarrages aléatoires : chaque heure de cours est
 * placée sur un créneau où ni la classe ni l'enseignant ne sont pris. Les
 * enseignants les plus chargés passent en premier.
 */
export function buildTimetable(random: () => number, maxAttempts = 200): LessonPlan[] {
  type Unit = { levelCode: string; subject: string; teacherNumber: string };
  const units: Unit[] = LEVELS.flatMap((level) =>
    Object.entries(level.hours).flatMap(([subject, hours]) => {
      const teacher = teacherFor(subject, level.code);
      return Array.from({ length: hours }, () => ({
        levelCode: level.code,
        subject,
        teacherNumber: teacher.number,
      }));
    }),
  );
  const teacherLoad = new Map<string, number>();
  for (const unit of units)
    teacherLoad.set(unit.teacherNumber, (teacherLoad.get(unit.teacherNumber) ?? 0) + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ordered = units
      .map((unit) => ({ unit, key: (teacherLoad.get(unit.teacherNumber) ?? 0) + random() }))
      .sort((a, b) => b.key - a.key)
      .map((entry) => entry.unit);
    const classBusy = new Set<string>();
    const teacherBusy = new Set<string>();
    const subjectPerDay = new Map<string, number>();
    const lessons: LessonPlan[] = [];
    let failed = false;

    for (const unit of ordered) {
      const candidates = SLOTS.map((slot, index) => ({ slot, index, r: random() })).sort((a, b) => a.r - b.r);
      const choice = candidates.find(({ index, slot }) => {
        const dayKey = `${unit.levelCode}|${unit.subject}|${slot.dayOfWeek}`;
        return (
          !classBusy.has(`${unit.levelCode}|${index}`) &&
          !teacherBusy.has(`${unit.teacherNumber}|${index}`) &&
          (subjectPerDay.get(dayKey) ?? 0) < MAX_SAME_SUBJECT_PER_DAY
        );
      });
      if (!choice) {
        failed = true;
        break;
      }
      classBusy.add(`${unit.levelCode}|${choice.index}`);
      teacherBusy.add(`${unit.teacherNumber}|${choice.index}`);
      const dayKey = `${unit.levelCode}|${unit.subject}|${choice.slot.dayOfWeek}`;
      subjectPerDay.set(dayKey, (subjectPerDay.get(dayKey) ?? 0) + 1);
      lessons.push({ ...unit, slot: choice.slot });
    }

    if (!failed) {
      return lessons.sort(
        (a, b) =>
          a.levelCode.localeCompare(b.levelCode) ||
          a.slot.dayOfWeek - b.slot.dayOfWeek ||
          a.slot.startTime.localeCompare(b.slot.startTime),
      );
    }
  }
  throw new Error("Could not build a conflict-free timetable");
}
