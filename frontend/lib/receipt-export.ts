export interface ReceiptLinkRow {
  invoiceId: string;
  recipient: string;
  /** Already formatted in the token's own decimals. */
  amount: string;
  symbol: string;
  url: string;
}

/**
 * One field for a spreadsheet. Invoice ids are payer-typed text, and a
 * spreadsheet runs a field that starts with = + - @ (or a tab or CR) as a
 * formula, so those get a leading apostrophe (OWASP's CSV-injection advice).
 * Then quoted per RFC 4180 if it holds a comma, quote or line break.
 */
function field(value: string): string {
  const inert = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(inert) ? `"${inert.replace(/"/g, '""')}"` : inert;
}

/** Every receipt link in a run, as a file the payer can mail-merge from. */
export function receiptLinksCsv(rows: ReceiptLinkRow[]): string {
  const lines = [
    ["invoiceId", "recipient", "amount", "token", "receiptLink"],
    ...rows.map((r) => [r.invoiceId, r.recipient, r.amount, r.symbol, r.url]),
  ];
  return lines.map((l) => l.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Every receipt link, one "invoice: link" per line, for the clipboard. */
export function receiptLinksText(rows: ReceiptLinkRow[]): string {
  return rows.map((r) => `${r.invoiceId}: ${r.url}`).join("\n");
}

/** A run name as a filename: a "/" or ":" in "Payroll 09/2026" would
 *  otherwise be rewritten by each browser in its own way. */
export function fileSlug(runLabel: string): string {
  return runLabel.replace(/[^A-Za-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}
