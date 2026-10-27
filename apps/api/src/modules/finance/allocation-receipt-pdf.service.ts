import PDFDocument from "pdfkit";

import { fetchTenantLogo, type TenantLetterhead } from "../../lib/pdf-letterhead.js";
import { prisma } from "../../lib/prisma.js";
import { getStudent } from "../students/student.service.js";

import { getAllocationGroup } from "./fee-schedule/payment-allocation.service.js";

const C = {
  night: "#0f172a",
  teal: "#14b8a6",
  gold: "#f59e0b",
  ink: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  wash: "#f8fafc",
};
const METHODS: Record<string, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement bancaire",
  CARD: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  WALLET: "Portefeuille",
  PREPAID_CODE: "Code prépayé",
  SPONSOR: "Prise en charge",
  CREDIT: "Avoir",
};
const amount = (cents: number) =>
  (cents / 100)
    .toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/[\u00a0\u202f]/g, " ");
const date = (value: Date) => value.toLocaleDateString("fr-FR", { timeZone: "UTC" });

function lineLabel(invoice: {
  kind: string;
  installmentSequence: number | null;
  number: string;
  items: { description: string }[];
}): string {
  if (invoice.kind === "REGISTRATION") return "Frais d'inscription";
  if (invoice.kind === "PENALTY") return "Pénalité de retard";
  if (invoice.kind === "INSTALLMENT" && invoice.installmentSequence)
    return `Tranche ${invoice.installmentSequence}`;
  return invoice.items[0]?.description ?? invoice.number;
}

/**
 * Reçu d'un versement réparti sur plusieurs échéances : pour chaque ligne, la
 * rubrique ou la tranche, le montant payé et le reste dû ; puis le total, l'avoir
 * éventuel, le reste dû global et la prochaine échéance — la même information que
 * le portail parent, pour éviter les litiges au guichet.
 */
export async function generateAllocationReceiptPdf(
  allocationGroupId: string,
  tenant: TenantLetterhead,
): Promise<Buffer> {
  const group = await getAllocationGroup(allocationGroupId);
  const first = group.payments[0]!;
  const student = await getStudent(first.invoice.studentId);
  const [school, open, employee] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: student.tenantId },
      select: { currency: { select: { isoCode: true } } },
    }),
    prisma.studentInvoice.findMany({
      where: {
        studentId: student.id,
        deletedAt: null,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    first.recordedByEmployeeId
      ? prisma.employee.findUnique({
          where: { id: first.recordedByEmployeeId },
          select: { firstName: true, lastName: true },
        })
      : Promise.resolve(null),
  ]);
  const currency = school?.currency.isoCode ?? "";
  const total = group.payments.reduce((sum, payment) => sum + payment.amountCents, 0) + group.creditCents;
  const outstanding = open.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0);
  const now = new Date();
  const next = open.find((invoice) => !invoice.dueAt || invoice.dueAt >= now) ?? open[0] ?? null;
  const logo = await fetchTenantLogo(tenant.logoUrl);
  const reference = first.receipt?.number ?? allocationGroupId.slice(0, 8).toUpperCase();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A5",
      margin: 28,
      info: { Title: "Reçu de versement - " + reference, Author: tenant.name, Creator: "EduManage" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width;
    const H = doc.page.height;
    const left = 28;
    const width = W - 56;
    const text = (
      s: string,
      x: number,
      y: number,
      w: number,
      size = 9,
      color = C.ink,
      bold = false,
      align: "left" | "right" = "left",
    ) => {
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(color)
        .text(s, x, y, { width: w, lineGap: 2, align });
    };
    doc.rect(0, 0, W, 7).fill(C.teal);
    doc.rect(W - 72, 0, 72, 7).fill(C.gold);
    if (logo) {
      try {
        doc.image(logo, left, 24, { fit: [46, 46], align: "center", valign: "center" });
      } catch {
        /* En-tête typographique si image illisible. */
      }
    } else {
      doc.roundedRect(left, 24, 46, 46, 8).fill(C.night);
      text(tenant.name.slice(0, 2).toUpperCase(), left + 7, 36, 36, 17, "#ffffff", true);
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(C.night)
      .text(tenant.name, 86, 26, { width: W - 114, height: 34, ellipsis: true });
    text("EDUMANAGE / FINANCES SCOLAIRES", 86, 60, W - 114, 6.5, C.muted, true);
    text("REÇU DE VERSEMENT", left, 88, width, 19, C.night, true);
    text(
      `N° ${reference}  ·  ${date(first.paidAt)}  ·  ${METHODS[first.method] ?? first.method}`,
      left,
      113,
      width,
      8,
      C.muted,
    );

    text("ÉLÈVE", left, 136, width, 7, C.muted, true);
    text(
      `${student.firstName} ${student.lastName}  (matricule ${student.matricule})`,
      left,
      147,
      width,
      10,
      C.night,
      true,
    );

    let y = 176;
    doc.rect(left, y, width, 18).fill(C.night);
    text("ÉCHÉANCE", left + 8, y + 5, width * 0.5, 7, "#ffffff", true);
    text("PAYÉ", left + width * 0.5, y + 5, width * 0.22, 7, "#ffffff", true, "right");
    text("RESTE DÛ", left + width * 0.72, y + 5, width * 0.26, 7, "#ffffff", true, "right");
    y += 22;
    for (const payment of group.payments) {
      const remaining = payment.invoice.totalCents - payment.invoice.paidCents;
      text(lineLabel(payment.invoice), left + 8, y, width * 0.5, 8.5, C.ink);
      text(amount(payment.amountCents), left + width * 0.5, y, width * 0.22, 8.5, C.ink, true, "right");
      text(
        amount(Math.max(remaining, 0)),
        left + width * 0.72,
        y,
        width * 0.26,
        8.5,
        C.muted,
        false,
        "right",
      );
      y += 16;
      doc
        .moveTo(left, y - 3)
        .lineTo(W - left, y - 3)
        .strokeColor(C.line)
        .lineWidth(0.5)
        .stroke();
      if (y > H - 190) break;
    }
    if (group.creditCents > 0) {
      text("Avoir (trop-perçu, reporté sur la prochaine échéance)", left + 8, y, width * 0.64, 8.5, C.ink);
      text(amount(group.creditCents), left + width * 0.5, y, width * 0.22, 8.5, C.ink, true, "right");
      y += 16;
    }
    y += 6;
    doc.roundedRect(left, y, width, 50, 8).fill(C.night);
    text("MONTANT VERSÉ", left + 14, y + 9, width - 28, 7, "#cbd5e1", true);
    text(`${amount(total)} ${currency}`, left + 14, y + 22, width - 28, 18, "#ffffff", true);
    y += 64;
    doc.roundedRect(left, y, width, 46, 8).fill(C.wash);
    text("RESTE DÛ SUR L'ANNÉE", left + 12, y + 9, width / 2 - 12, 6.5, C.muted, true);
    text(`${amount(outstanding)} ${currency}`, left + 12, y + 22, width / 2 - 12, 11, C.night, true);
    text("PROCHAINE ÉCHÉANCE", left + width / 2, y + 9, width / 2 - 12, 6.5, C.muted, true);
    text(
      next
        ? `${amount(next.totalCents - next.paidCents)} ${currency}${next.dueAt ? ` le ${date(next.dueAt)}` : ""}`
        : "Aucune",
      left + width / 2,
      y + 22,
      width / 2 - 12,
      10,
      C.night,
      true,
    );
    y += 62;
    text(
      "Enregistré par : " + (employee ? `${employee.firstName} ${employee.lastName}` : "-"),
      left,
      y,
      width,
      8,
      C.muted,
    );
    doc
      .moveTo(left, H - 37)
      .lineTo(W - left, H - 37)
      .strokeColor(C.line)
      .lineWidth(0.5)
      .stroke();
    doc.page.margins.bottom = 0;
    text(
      "EduManage | Reçu groupé de " + group.payments.length + " ligne(s)",
      left,
      H - 26,
      width,
      6,
      C.muted,
    );
    doc.end();
  });
}
