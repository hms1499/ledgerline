import { describe, it, expect } from "vitest";
import { fileSlug, receiptLinksCsv, receiptLinksText } from "@/lib/receipt-export";

const row = (over: Partial<Parameters<typeof receiptLinksCsv>[0][number]> = {}) => ({
  invoiceId: "INV-1", recipient: "0xe48A096B9E74f064b13c17734af29F85E02d732a",
  amount: "0.10", symbol: "USDC", url: "https://ledgerline.test/r/0xab?i=INV-1&s=0x1&p=x&n=testnet",
  ...over,
});

describe("receiptLinksCsv — one file the payer can mail-merge from", () => {
  it("has a header and one line per payment, CRLF-terminated", () => {
    const csv = receiptLinksCsv([row(), row({ invoiceId: "INV-2" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("invoiceId,recipient,amount,token,receiptLink");
    expect(lines[1]).toBe(
      "INV-1,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10,USDC,https://ledgerline.test/r/0xab?i=INV-1&s=0x1&p=x&n=testnet",
    );
    expect(lines).toHaveLength(4); // header, two rows, trailing empty
  });

  it("quotes a field holding a comma, quote or newline", () => {
    const csv = receiptLinksCsv([row({ invoiceId: 'A, "B"\nC' })]);
    expect(csv.split("\r\n")[1]!.startsWith('"A, ""B""\nC",')).toBe(true);
  });

  it("defuses a field a spreadsheet would run as a formula", () => {
    // An invoice id is payer-typed text; opened in Excel, "=HYPERLINK(...)"
    // would execute. A leading apostrophe makes it inert text.
    const csv = receiptLinksCsv([row({ invoiceId: "=HYPERLINK(\"x\")" }), row({ invoiceId: "@SUM(1)" })]);
    const [, first, second] = csv.split("\r\n");
    expect(first!.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(second!.startsWith("'@SUM(1)")).toBe(true);
  });
});

describe("receiptLinksText — what Copy all puts on the clipboard", () => {
  it("is one 'invoice: link' line per payment", () => {
    expect(receiptLinksText([row(), row({ invoiceId: "INV-2", url: "u2" })])).toBe(
      "INV-1: https://ledgerline.test/r/0xab?i=INV-1&s=0x1&p=x&n=testnet\nINV-2: u2",
    );
  });
});

describe("fileSlug — a run name made safe for a download's filename", () => {
  it("keeps letters, digits, dots and dashes, and collapses the rest", () => {
    expect(fileSlug("Payroll 09/2026")).toBe("Payroll-09-2026");
    expect(fileSlug("check 2026-09-23T02:06:42.758Z")).toBe("check-2026-09-23T02-06-42.758Z");
  });

  it("never returns an empty or dash-edged name", () => {
    expect(fileSlug("  /// ")).toBe("run");
    expect(fileSlug("-a-")).toBe("a");
  });
});
