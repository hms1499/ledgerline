/** What the file picker offers. The spreadsheet formats are listed only so a
 *  person can choose one and be told how to turn it into a CSV: a macOS
 *  picker greys out anything not named here, which explains nothing. */
export const RUN_FILE_ACCEPT = ".csv,.tsv,text/csv,text/tab-separated-values,.numbers,.xlsx,.xls,.ods";

/** The name a paste goes by, where a file would give its own. */
export const PASTED_ROWS = "the pasted rows";

const PASTE = "Or select the cells, header row included, copy them and paste them below.";

const extension = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();

const startsWith = (head: Uint8Array, magic: readonly number[]) =>
  head.length >= magic.length && magic.every((b, i) => head[i] === b);

/** Every .xlsx, .ods and .numbers file is a zip archive. */
const ZIP = [0x50, 0x4b, 0x03, 0x04];
/** A .xls from before 2007 is an OLE compound file. */
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Why a chosen file cannot be read as rows, or undefined when it can.
 *
 * A spreadsheet's own format is refused rather than read. Its cells hold the
 * stored value, not the one the sheet shows, so a cell displaying 12.50 can
 * hold 12.4999: an export or a copy carries what the person saw, and that is
 * the only amount this page will pay.
 *
 * `head` is the file's first bytes. It catches a spreadsheet that was renamed
 * to .csv, which would otherwise be read as a screen of binary noise.
 */
export function spreadsheetRefusal(name: string, head: Uint8Array): string | undefined {
  const ext = extension(name);
  if (ext === "numbers") {
    return `This is a Numbers file, which this page cannot read. In Numbers, choose File → Export To → CSV…, then drop the .csv here. ${PASTE}`;
  }
  if (ext === "xlsx" || ext === "xls" || ext === "ods") {
    return `This is a spreadsheet file, which this page cannot read. Save or download it as CSV from the app it came from, then drop the .csv here. ${PASTE}`;
  }
  if (startsWith(head, ZIP) || startsWith(head, OLE)) {
    return `This file is a spreadsheet saved in its own format, not a CSV. Export or save it as CSV from the app it came from, then drop that file here. ${PASTE}`;
  }
  return undefined;
}
