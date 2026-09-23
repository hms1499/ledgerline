/**
 * The file a new payer starts from: the exact header the parser requires,
 * one line per token, amounts written the way an invoice writes them. Shown
 * on the upload screen and offered as a download from the home page, so the
 * two can never disagree. Recipients are placeholders to replace.
 */
export const SAMPLE_CSV = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BTC-003,cirBTC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.00001`;

/** A link that downloads the sample without a round trip to any server. */
export function sampleCsvHref(): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;
}
