import { randomBytes } from "node:crypto";

/** Human-scannable, globally-unique-enough reference for invoices/receipts/cash transactions. */
export function generateReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
