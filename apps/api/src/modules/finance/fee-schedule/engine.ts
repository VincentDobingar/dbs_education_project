/**
 * Moteur d'échéancier : fonctions pures, sans base de données, pour qu'un même
 * calcul serve l'aperçu, l'inscription réelle et les tests.
 *
 * Règles (document « Système d'inscription et d'échéancier flexible ») :
 * - l'inscription (nature REGISTRATION) est une échéance à part, exigible le jour
 *   de l'inscription ;
 * - la scolarité (TUITION), remises déduites, est découpée selon les parts du plan
 *   (points de base) ; la dernière tranche absorbe les arrondis ;
 * - annexes et examens sont facturés avec la tranche indiquée (1 par défaut) ;
 * - inscription en cours d'année : les tranches échues sont regroupées en une
 *   échéance immédiate (GROUP) ou ne sont pas facturées (PRORATA).
 */

export type FeeNatureValue = "REGISTRATION" | "TUITION" | "ANNEX" | "EXAM";
export type StudentTypeValue = "ALL" | "NEW" | "RETURNING";
export type DiscountKindValue = "PERCENT" | "AMOUNT";
export type AnchorTypeValue = "ENROLLMENT" | "PERIOD_START" | "FIXED_DATE";
export type MidYearPolicy = "GROUP" | "PRORATA";

export const FULL_SHARE_BPS = 10_000;
const DAY_MS = 86_400_000;

export interface FeeStructureCandidate {
  id: string;
  feeCategoryId: string;
  categoryLabel: string;
  nature: FeeNatureValue;
  gradeLevelId: string | null;
  programId: string | null;
  studentType: StudentTypeValue;
  amountCents: number;
  isMandatory: boolean;
  dueWithInstallment: number | null;
}

export interface FeeLine {
  feeStructureId: string;
  feeCategoryId: string;
  label: string;
  nature: FeeNatureValue;
  amountCents: number;
  isMandatory: boolean;
  dueWithInstallment: number | null;
}

/**
 * Une ligne par rubrique : parmi les tarifs applicables, le plus précis gagne
 * (filière, puis niveau, puis profil nouveau / ancien). Un tarif facultatif
 * (cantine, transport…) n'est retenu que s'il a été choisi.
 */
export function selectFeeLines(
  structures: FeeStructureCandidate[],
  context: {
    gradeLevelId: string;
    programId: string | null;
    isReturning: boolean;
    optionalFeeStructureIds: readonly string[];
  },
): FeeLine[] {
  const profile: StudentTypeValue = context.isReturning ? "RETURNING" : "NEW";
  const best = new Map<string, { score: number; structure: FeeStructureCandidate }>();
  for (const structure of structures) {
    if (structure.gradeLevelId && structure.gradeLevelId !== context.gradeLevelId) continue;
    if (structure.programId && structure.programId !== context.programId) continue;
    if (structure.studentType !== "ALL" && structure.studentType !== profile) continue;
    const score =
      (structure.programId ? 4 : 0) +
      (structure.gradeLevelId ? 2 : 0) +
      (structure.studentType !== "ALL" ? 1 : 0);
    const current = best.get(structure.feeCategoryId);
    if (!current || score > current.score) best.set(structure.feeCategoryId, { score, structure });
  }
  const optional = new Set(context.optionalFeeStructureIds);
  return [...best.values()]
    .map(({ structure }) => structure)
    .filter((structure) => structure.isMandatory || optional.has(structure.id))
    .map((structure) => ({
      feeStructureId: structure.id,
      feeCategoryId: structure.feeCategoryId,
      label: structure.categoryLabel,
      nature: structure.nature,
      amountCents: structure.amountCents,
      isMandatory: structure.isMandatory,
      dueWithInstallment: structure.dueWithInstallment,
    }));
}

/** Liste des tarifs facultatifs proposables à l'inscription (même sélection, sans filtre « choisi »). */
export function optionalFeeChoices(
  structures: FeeStructureCandidate[],
  context: { gradeLevelId: string; programId: string | null; isReturning: boolean },
): FeeLine[] {
  const all = selectFeeLines(structures, {
    ...context,
    optionalFeeStructureIds: structures.map((s) => s.id),
  });
  return all.filter((line) => !line.isMandatory);
}

export interface PlanInstallmentRule {
  sequence: number;
  label: string;
  shareBps: number;
  anchorType: AnchorTypeValue;
  academicPeriodId: string | null;
  offsetDays: number;
  fixedDate: Date | null;
}

export interface ResolvedInstallment {
  sequence: number;
  label: string;
  shareBps: number;
  dueDate: Date;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Date d'échéance de chaque tranche, à partir du calendrier de l'année scolaire. */
export function resolveInstallmentDates(
  rules: PlanInstallmentRule[],
  periodStartById: ReadonlyMap<string, Date>,
  enrollmentDate: Date,
): ResolvedInstallment[] {
  return [...rules]
    .sort((a, b) => a.sequence - b.sequence)
    .map((rule) => {
      let base: Date;
      if (rule.anchorType === "PERIOD_START") {
        const start = rule.academicPeriodId ? periodStartById.get(rule.academicPeriodId) : undefined;
        if (!start) throw new Error(`Unknown academic period for installment ${rule.sequence}`);
        base = startOfUtcDay(start);
      } else if (rule.anchorType === "FIXED_DATE") {
        if (!rule.fixedDate) throw new Error(`Missing fixed date for installment ${rule.sequence}`);
        base = startOfUtcDay(rule.fixedDate);
      } else {
        base = startOfUtcDay(enrollmentDate);
      }
      return {
        sequence: rule.sequence,
        label: rule.label,
        shareBps: rule.shareBps,
        dueDate: addDays(base, rule.offsetDays),
      };
    });
}

/** Contrôle d'un plan : 1 à 12 tranches, numéros 1..n, parts positives totalisant 100 %. */
export function validatePlanShares(
  rules: Pick<PlanInstallmentRule, "sequence" | "shareBps">[],
): string | null {
  if (rules.length < 1 || rules.length > 12) return "PLAN_INSTALLMENT_COUNT";
  const sequences = rules.map((rule) => rule.sequence).sort((a, b) => a - b);
  if (sequences.some((sequence, index) => sequence !== index + 1)) return "PLAN_SEQUENCE_GAP";
  if (rules.some((rule) => !Number.isInteger(rule.shareBps) || rule.shareBps <= 0))
    return "PLAN_SHARE_INVALID";
  const total = rules.reduce((sum, rule) => sum + rule.shareBps, 0);
  if (total !== FULL_SHARE_BPS) return "PLAN_SHARES_NOT_100";
  return null;
}

export interface DiscountInput {
  label: string;
  kind: DiscountKindValue;
  /** Points de base (PERCENT) ou centimes (AMOUNT). */
  value: number;
  presetId?: string | null;
  reason?: string | null;
}

export interface AppliedDiscount extends DiscountInput {
  amountCents: number;
}

/** Remises sur la scolarité, plafonnées au montant de la scolarité. */
export function applyDiscounts(tuitionCents: number, discounts: DiscountInput[]): AppliedDiscount[] {
  let remaining = tuitionCents;
  return discounts.map((discount) => {
    const raw =
      discount.kind === "PERCENT"
        ? Math.floor((tuitionCents * Math.min(discount.value, FULL_SHARE_BPS)) / FULL_SHARE_BPS)
        : discount.value;
    const amountCents = Math.max(0, Math.min(raw, remaining));
    remaining -= amountCents;
    return { ...discount, amountCents };
  });
}

/** Découpe `total` selon des poids entiers ; le dernier élément reçoit le reste. */
export function splitByWeights(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.length === 0) return [];
  if (weightSum <= 0) return weights.map((_, index) => (index === weights.length - 1 ? total : 0));
  const parts = weights.map((weight) => Math.floor((total * weight) / weightSum));
  const allocated = parts.reduce((sum, part) => sum + part, 0);
  parts[parts.length - 1]! += total - allocated;
  return parts;
}

export interface DueItem {
  feeStructureId: string | null;
  label: string;
  nature: FeeNatureValue;
  amountCents: number;
  discountCents: number;
}

export interface ScheduledDue {
  kind: "REGISTRATION" | "INSTALLMENT";
  /** Numéro de tranche (la première d'un regroupement) ; nul pour l'inscription. */
  sequence: number | null;
  /** Tranches couvertes (plusieurs si regroupement d'échéances passées). */
  sequences: number[];
  label: string;
  dueDate: Date;
  items: DueItem[];
  totalCents: number;
}

export interface ScheduleResult {
  grossCents: number;
  discountCents: number;
  totalCents: number;
  registrationCents: number;
  tuitionGrossCents: number;
  tuitionNetCents: number;
  discounts: AppliedDiscount[];
  dues: ScheduledDue[];
  /** Tranches non facturées (politique PRORATA). */
  skippedSequences: number[];
  /** Tranches échues regroupées en une échéance immédiate (politique GROUP). */
  groupedSequences: number[];
}

export function buildSchedule(input: {
  lines: FeeLine[];
  installments: ResolvedInstallment[];
  discounts: DiscountInput[];
  enrollmentDate: Date;
  midYearPolicy: MidYearPolicy;
}): ScheduleResult {
  const today = startOfUtcDay(input.enrollmentDate);
  const registrationLines = input.lines.filter((line) => line.nature === "REGISTRATION");
  const tuitionLines = input.lines.filter((line) => line.nature === "TUITION");
  const annexLines = input.lines.filter((line) => line.nature === "ANNEX" || line.nature === "EXAM");

  let installments: ResolvedInstallment[] =
    input.installments.length > 0
      ? [...input.installments].sort((a, b) => a.sequence - b.sequence)
      : [{ sequence: 1, label: "Scolarité", shareBps: FULL_SHARE_BPS, dueDate: today }];

  const tuitionGrossCents = tuitionLines.reduce((sum, line) => sum + line.amountCents, 0);
  const discounts = applyDiscounts(tuitionGrossCents, input.discounts);
  const discountCents = discounts.reduce((sum, discount) => sum + discount.amountCents, 0);

  // Inscription en cours d'année.
  const past = installments.filter((installment) => installment.dueDate < today);
  let skippedSequences: number[] = [];
  let groupedSequences: number[] = [];
  let tuitionShareFactor = FULL_SHARE_BPS; // part de la scolarité réellement facturée
  type Bucket = { sequences: number[]; label: string; dueDate: Date; weight: number };
  let buckets: Bucket[];
  if (past.length > 0 && input.midYearPolicy === "PRORATA") {
    const remaining = installments.filter((installment) => installment.dueDate >= today);
    if (remaining.length === 0) {
      // Arrivée après la dernière échéance : la dernière période reste due, aujourd'hui.
      const last = installments[installments.length - 1]!;
      remaining.push({ ...last, dueDate: today });
    }
    const kept = new Set(remaining.map((installment) => installment.sequence));
    skippedSequences = installments.filter((i) => !kept.has(i.sequence)).map((i) => i.sequence);
    tuitionShareFactor = remaining.reduce((sum, installment) => sum + installment.shareBps, 0);
    installments = remaining;
    buckets = installments.map((i) => ({
      sequences: [i.sequence],
      label: i.label,
      dueDate: i.dueDate,
      weight: i.shareBps,
    }));
  } else if (past.length > 0) {
    groupedSequences = past.map((installment) => installment.sequence);
    const grouped: Bucket = {
      sequences: groupedSequences,
      label: past.length === 1 ? past[0]!.label : `${past[0]!.label} à ${past[past.length - 1]!.label}`,
      dueDate: today,
      weight: past.reduce((sum, installment) => sum + installment.shareBps, 0),
    };
    buckets = [
      grouped,
      ...installments
        .filter((installment) => installment.dueDate >= today)
        .map((i) => ({ sequences: [i.sequence], label: i.label, dueDate: i.dueDate, weight: i.shareBps })),
    ];
  } else {
    buckets = installments.map((i) => ({
      sequences: [i.sequence],
      label: i.label,
      dueDate: i.dueDate,
      weight: i.shareBps,
    }));
  }

  // Scolarité facturée (prorata éventuel), puis répartition des remises entre lignes.
  const chargedGross = tuitionLines.map((line) =>
    Math.floor((line.amountCents * tuitionShareFactor) / FULL_SHARE_BPS),
  );
  const chargedDiscount = Math.floor((discountCents * tuitionShareFactor) / FULL_SHARE_BPS);
  const discountByLine = splitByWeights(chargedDiscount, chargedGross);
  const weights = buckets.map((bucket) => bucket.weight);
  const grossSplit = chargedGross.map((gross) => splitByWeights(gross, weights));
  const discountSplit = discountByLine.map((discount) => splitByWeights(discount, weights));

  const dues: ScheduledDue[] = [];
  const registrationItems: DueItem[] = registrationLines.map((line) => ({
    feeStructureId: line.feeStructureId,
    label: line.label,
    nature: line.nature,
    amountCents: line.amountCents,
    discountCents: 0,
  }));
  const registrationCents = registrationItems.reduce((sum, item) => sum + item.amountCents, 0);
  if (registrationCents > 0) {
    dues.push({
      kind: "REGISTRATION",
      sequence: null,
      sequences: [],
      label: "Inscription",
      dueDate: today,
      items: registrationItems,
      totalCents: registrationCents,
    });
  }

  const bucketItems: DueItem[][] = buckets.map((_, bucketIndex) =>
    tuitionLines
      .map((line, lineIndex) => ({
        feeStructureId: line.feeStructureId,
        label: line.label,
        nature: line.nature,
        amountCents: grossSplit[lineIndex]![bucketIndex]!,
        discountCents: discountSplit[lineIndex]![bucketIndex]!,
      }))
      .filter((item) => item.amountCents > 0),
  );
  for (const line of annexLines) {
    const target = line.dueWithInstallment ?? 1;
    let index = buckets.findIndex((bucket) => bucket.sequences.includes(target));
    if (index < 0)
      index = buckets.findIndex((bucket) => bucket.sequences.some((sequence) => sequence > target));
    if (index < 0) index = buckets.length - 1;
    bucketItems[index]!.push({
      feeStructureId: line.feeStructureId,
      label: line.label,
      nature: line.nature,
      amountCents: line.amountCents,
      discountCents: 0,
    });
  }
  buckets.forEach((bucket, index) => {
    const items = bucketItems[index]!;
    const totalCents = items.reduce((sum, item) => sum + item.amountCents - item.discountCents, 0);
    if (items.length === 0 || totalCents <= 0) return;
    dues.push({
      kind: "INSTALLMENT",
      sequence: bucket.sequences[0]!,
      sequences: bucket.sequences,
      label: bucket.label,
      dueDate: bucket.dueDate,
      items,
      totalCents,
    });
  });

  const annexCents = annexLines.reduce((sum, line) => sum + line.amountCents, 0);
  const tuitionChargedGross = chargedGross.reduce((sum, value) => sum + value, 0);
  const grossCents = registrationCents + tuitionChargedGross + annexCents;
  const totalCents = dues.reduce((sum, due) => sum + due.totalCents, 0);
  return {
    grossCents,
    discountCents: chargedDiscount,
    totalCents,
    registrationCents,
    tuitionGrossCents,
    tuitionNetCents: tuitionChargedGross - chargedDiscount,
    discounts: discounts.map((discount) => ({
      ...discount,
      amountCents: Math.floor((discount.amountCents * tuitionShareFactor) / FULL_SHARE_BPS),
    })),
    dues,
    skippedSequences,
    groupedSequences,
  };
}

export interface AllocatableInvoice {
  id: string;
  kind: "MANUAL" | "REGISTRATION" | "INSTALLMENT" | "PENALTY";
  outstandingCents: number;
  dueAt: Date | null;
  createdAt: Date;
}

/**
 * Ordre de répartition d'un versement : l'inscription d'abord, puis toutes les
 * autres échéances (tranches, annexes, arriérés, pénalités) de la plus ancienne à
 * la plus récente. Le reliquat devient un avoir.
 */
export function allocatePayment(
  amountCents: number,
  invoices: AllocatableInvoice[],
): { allocations: { invoiceId: string; amountCents: number }[]; leftoverCents: number } {
  const order = [...invoices]
    .filter((invoice) => invoice.outstandingCents > 0)
    .sort((a, b) => {
      const ra = a.kind === "REGISTRATION" ? 0 : 1;
      const rb = b.kind === "REGISTRATION" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const da = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  let remaining = amountCents;
  const allocations: { invoiceId: string; amountCents: number }[] = [];
  for (const invoice of order) {
    if (remaining <= 0) break;
    const part = Math.min(remaining, invoice.outstandingCents);
    allocations.push({ invoiceId: invoice.id, amountCents: part });
    remaining -= part;
  }
  return { allocations, leftoverCents: remaining };
}
