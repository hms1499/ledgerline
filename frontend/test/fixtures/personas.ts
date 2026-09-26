/**
 * Six files a payer realistically brings (spec 2026-09-26-csv-sheet-editor §1),
 * byte-exact: BOMs, line endings and missing final breaks included. The same
 * files, written out, are `.superpowers/ux-audit/persona-*.csv`.
 */
export const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
export const B = "0x52908400098527886E0F7030069857D2E4169EE7";
export const C = "0x1111111111111111111111111111111111111111";
export const D = "0x2222222222222222222222222222222222222222";

export const PERSONAS = {
  /** P1: Google Sheets; the currency lives in a header, $ formatting, an empty row and a Total. */
  gsheets: "Name,Email,Wallet Address,Amount (USDC),Invoice #,Notes\n"
    + `Alice Nguyen,alice@example.com,${A},"$1,250.00",INV-2026-09-01,"Design, Sept"\n`
    + `Bob Tran,bob@example.com,${B},$980.00,INV-2026-09-02,\n`
    + `Chi Le,chi@example.com,${C},"$2,400.50",INV-2026-09-03,Backend\n`
    + ",,,,,\nTotal,,,\"$4,630.50\",,\n",
  /** P2: Excel in German: BOM, CRLF, `;`, German headers, EUR, 1.234,56. */
  excelDe: "﻿Empfänger;Wallet;Währung;Betrag;Rechnung\r\n"
    + `Anna Schmidt;${A};EUR;1.234,56;RE-0917\r\n`
    + `Ben Müller;${B};EUR;850,00;RE-0918\r\n`
    + `Clara Wolf;${C};EUR;2.000,00;RE-0919\r\n`,
  /** P3: the app's own sample after Numbers: a title line, CRLF, no final break. */
  numbers: `ledgerline-sample\r\ninvoiceId;token;to;amount\r\nINV-US-001;USDC;${A};0.10\r\n`
    + `INV-EU-002;EURC;${A};0.10\r\nINV-BTC-003;cirBTC;${A};0.000001`,
  /** P4: last month's clean file, reused. */
  nextMonth: "invoiceId,token,to,amount\n"
    + `PAY-2026-09-01,USDC,${A},1200\nPAY-2026-09-02,USDC,${B},950\nPAY-2026-09-03,EURC,${C},800\n`,
  /** P5: a payroll platform's report: metadata above the header, bank rows, USDT. */
  platform: "Contractor payments report\nPeriod: 2026-09-01 to 2026-09-30\nGenerated: 2026-10-01 09:12 UTC\n\n"
    + "Contractor,Invoice ID,Payment method,Currency,Amount,Crypto wallet\n"
    + `Dana Pham,INV-771,Crypto,USDC,1500.00,${A}\nEvan Ho,INV-772,Bank transfer,USD,2100.00,\n`
    + `Fiona Vo,INV-773,Crypto,USDT,700.00,${B}\nGia Lam,INV-774,Crypto,EURC,640.00,${C}\n`,
  /** P6: the smallest real list: one currency, no invoice numbers. */
  twoColumns: `wallet,amount\n${A},100\n${B},250\n${C},75\n`,
} as const;
