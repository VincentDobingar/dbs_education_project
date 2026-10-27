import { prisma } from "../../../lib/prisma.js";

const DAY_MS = 86_400_000;

interface Bucket {
  key: string;
  label: string;
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
}

function bucket(map: Map<string, Bucket>, key: string, label: string): Bucket {
  let value = map.get(key);
  if (!value) {
    value = { key, label, billedCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0 };
    map.set(key, value);
  }
  return value;
}

function rate(paid: number, billed: number): number {
  return billed > 0 ? Math.round((paid / billed) * 1000) / 10 : 0;
}

/**
 * Tableau de recouvrement de la direction : taux par tranche et par classe, élèves
 * en retard et encaissements attendus sur les 30 prochains jours.
 */
export async function getRecoveryDashboard(academicYearId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  const [invoices, enrollments] = await Promise.all([
    prisma.studentInvoice.findMany({
      where: { academicYearId, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: {
        id: true,
        studentId: true,
        kind: true,
        installmentSequence: true,
        totalCents: true,
        paidCents: true,
        dueAt: true,
        status: true,
      },
    }),
    prisma.enrollment.findMany({
      where: { academicYearId, deletedAt: null },
      select: {
        studentId: true,
        status: true,
        classroom: { select: { id: true, name: true } },
        student: { select: { firstName: true, lastName: true, matricule: true } },
      },
    }),
  ]);
  const enrollmentByStudent = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]));
  const byTranche = new Map<string, Bucket>();
  const byClass = new Map<string, Bucket>();
  const late = new Map<
    string,
    {
      studentId: string;
      name: string;
      matricule: string;
      classroom: string;
      overdueCents: number;
      oldestDueAt: Date;
    }
  >();
  let billed = 0;
  let paid = 0;
  let overdueTotal = 0;
  let expectedNext30 = 0;

  for (const invoice of invoices) {
    const outstanding = Math.max(invoice.totalCents - invoice.paidCents, 0);
    const isOverdue = outstanding > 0 && invoice.dueAt !== null && invoice.dueAt < now;
    const trancheKey =
      invoice.kind === "REGISTRATION"
        ? "R"
        : invoice.kind === "INSTALLMENT" && invoice.installmentSequence
          ? `T${invoice.installmentSequence}`
          : invoice.kind === "PENALTY"
            ? "P"
            : "M";
    const trancheLabel =
      trancheKey === "R"
        ? "Inscription"
        : trancheKey === "P"
          ? "Pénalités"
          : trancheKey === "M"
            ? "Autres factures"
            : `Tranche ${invoice.installmentSequence}`;
    const enrollment = enrollmentByStudent.get(invoice.studentId);
    const classKey = enrollment?.classroom.id ?? "none";
    for (const target of [
      bucket(byTranche, trancheKey, trancheLabel),
      bucket(byClass, classKey, enrollment?.classroom.name ?? "Sans classe"),
    ]) {
      target.billedCents += invoice.totalCents;
      target.paidCents += Math.min(invoice.paidCents, invoice.totalCents);
      target.outstandingCents += outstanding;
      if (isOverdue) target.overdueCents += outstanding;
    }
    billed += invoice.totalCents;
    paid += Math.min(invoice.paidCents, invoice.totalCents);
    if (isOverdue) {
      overdueTotal += outstanding;
      const entry = late.get(invoice.studentId) ?? {
        studentId: invoice.studentId,
        name: enrollment
          ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
          : invoice.studentId,
        matricule: enrollment?.student.matricule ?? "",
        classroom: enrollment?.classroom.name ?? "",
        overdueCents: 0,
        oldestDueAt: invoice.dueAt!,
      };
      entry.overdueCents += outstanding;
      if (invoice.dueAt! < entry.oldestDueAt) entry.oldestDueAt = invoice.dueAt!;
      late.set(invoice.studentId, entry);
    }
    if (outstanding > 0 && invoice.dueAt && invoice.dueAt >= now && invoice.dueAt <= horizon) {
      expectedNext30 += outstanding;
    }
  }

  const order = (key: string) => (key === "R" ? -1 : key.startsWith("T") ? Number(key.slice(1)) : 100);
  return {
    totals: {
      billedCents: billed,
      paidCents: paid,
      outstandingCents: billed - paid,
      overdueCents: overdueTotal,
      recoveryRate: rate(paid, billed),
      expectedNext30DaysCents: expectedNext30,
      admittedAwaitingRegistration: enrollments.filter((enrollment) => enrollment.status === "ADMITTED")
        .length,
    },
    byTranche: [...byTranche.values()]
      .sort((a, b) => order(a.key) - order(b.key))
      .map((value) => ({ ...value, recoveryRate: rate(value.paidCents, value.billedCents) })),
    byClassroom: [...byClass.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "fr"))
      .map((value) => ({ ...value, recoveryRate: rate(value.paidCents, value.billedCents) })),
    lateStudents: [...late.values()]
      .sort((a, b) => b.overdueCents - a.overdueCents)
      .slice(0, 200)
      .map((entry) => ({
        ...entry,
        oldestDueAt: entry.oldestDueAt.toISOString(),
        daysLate: Math.floor((now.getTime() - entry.oldestDueAt.getTime()) / DAY_MS),
      })),
  };
}
