import ExcelJS from "exceljs";

/**
 * "Export Excel natif" (§5/§7 — noté hors périmètre jusqu'ici) : contrairement au CSV
 * partagé (lib/csv.ts), les valeurs numériques restent de vraies cellules numériques
 * (une somme fonctionne directement dans le tableur, pas une colonne de texte) plutôt
 * que des chaînes déjà formatées. `value: null` produit une cellule vide, jamais la
 * chaîne "null" — même discipline que buildCsv sur les valeurs absentes.
 */
export type XlsxCellValue = string | number | Date | null;

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function buildXlsxBuffer(
  sheetName: string,
  columns: readonly string[],
  rows: readonly (readonly XlsxCellValue[])[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((header) => ({
    header,
    width: Math.max(header.length + 2, 12),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row.map((value) => value ?? ""));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
