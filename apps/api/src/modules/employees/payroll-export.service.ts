import { buildCsv } from "../../lib/csv.js";
import { prisma } from "../../lib/prisma.js";

export interface PayrollLine {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  contractType: string | null;
  salaryCents: number | null;
}

/**
 * §27 : export de paie — le contrat actif (startDate <= aujourd'hui <= endDate ou
 * endDate nul) de chaque employé non archivé/non licencié. Un employé sans contrat
 * actif apparaît quand même (jobTitle/matricule restent utiles pour la paie), avec
 * contractType/salaryCents à null plutôt qu'omis silencieusement — un export de paie
 * qui masquerait les trous serait plus dangereux qu'un champ vide explicite.
 * Restreint à `hr.salary.manage` côté route : données salariales (§27).
 */
export async function getPayrollExport(): Promise<PayrollLine[]> {
  const now = new Date();

  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, status: { not: "TERMINATED" } },
    include: {
      contracts: {
        where: { startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: { lastName: "asc" },
  });

  return employees.map((employee) => {
    const activeContract = employee.contracts[0] ?? null;
    return {
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      jobTitle: employee.jobTitle,
      contractType: activeContract?.contractType ?? null,
      salaryCents: activeContract?.salaryCents ?? null,
    };
  });
}

function formatAmount(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export function payrollExportToCsv(lines: PayrollLine[]): string {
  const rows = lines.map((line) => [
    line.employeeNumber,
    line.firstName,
    line.lastName,
    line.jobTitle,
    line.contractType ?? "",
    formatAmount(line.salaryCents),
  ]);
  return buildCsv(["Matricule", "Prénom", "Nom", "Fonction", "Type de contrat", "Salaire"], rows);
}
