/**
 * Shared by every CSV export in this codebase (§19 students export, §23 financial
 * reports). Formula-injection guard first (`=`, `+`, `-`, `@` prefix neutralized for
 * spreadsheet apps), then standard comma/quote/newline escaping.
 */
export function escapeCsvField(value: string): string {
  let escaped = value;
  if (/^[=+\-@]/.test(escaped)) {
    escaped = `'${escaped}`;
  }
  if (/["\n\r,]/.test(escaped)) {
    escaped = `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

export function buildCsv(columns: readonly string[], rows: readonly string[][]): string {
  const escapedRows = rows.map((row) => row.map(escapeCsvField).join(","));
  return [columns.join(","), ...escapedRows].join("\r\n");
}
