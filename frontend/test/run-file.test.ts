import { describe, it, expect } from "vitest";
import { spreadsheetRefusal, RUN_FILE_ACCEPT } from "@/lib/run-file";

const bytes = (...b: number[]) => new Uint8Array(b);
const TEXT = new TextEncoder().encode("invoiceId,token,to,amount\n");
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

describe("spreadsheetRefusal", () => {
  it("reads a CSV or TSV that is text", () => {
    expect(spreadsheetRefusal("payroll.csv", TEXT)).toBeUndefined();
    expect(spreadsheetRefusal("payroll.tsv", TEXT)).toBeUndefined();
    expect(spreadsheetRefusal("PAYROLL.CSV", TEXT)).toBeUndefined();
  });

  it("tells a Numbers user the exact menu to export from, by name alone", () => {
    // An older Numbers file is a folder, so it may have no bytes to look at.
    const message = spreadsheetRefusal("September.numbers", bytes());
    expect(message).toBe(
      "This is a Numbers file, which this page cannot read. In Numbers, choose File → Export To → CSV…, " +
      "then drop the .csv here. Or select the cells, header row included, copy them and paste them below.",
    );
  });

  it("tells an Excel, LibreOffice or Google Sheets user to save as CSV", () => {
    for (const name of ["pay.xlsx", "pay.XLS", "pay.ods"]) {
      expect(spreadsheetRefusal(name, ZIP)).toMatch(/^This is a spreadsheet file, which this page cannot read\. Save or download it as CSV/);
    }
  });

  it("catches a spreadsheet renamed to .csv by what is inside it", () => {
    expect(spreadsheetRefusal("pay.csv", ZIP)).toMatch(/^This file is a spreadsheet saved in its own format, not a CSV\./);
    expect(spreadsheetRefusal("pay.csv", OLE)).toMatch(/^This file is a spreadsheet saved in its own format, not a CSV\./);
  });

  it("lets the spreadsheet files through the file picker, so they reach the explanation", () => {
    for (const ext of [".csv", ".tsv", ".numbers", ".xlsx", ".xls", ".ods"]) {
      expect(RUN_FILE_ACCEPT.split(",")).toContain(ext);
    }
  });
});
