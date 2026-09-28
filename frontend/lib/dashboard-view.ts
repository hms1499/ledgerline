import { knownTokenSymbol, paidByToken, type Address, type TokenTotal } from "@ledgerline/core";
import type { Coverage, RunRead } from "@/lib/run-reads";
import type { RunRecord } from "@/lib/history";
import { amountText, type TokenMeta } from "@/lib/token-meta";
import { paidAtText } from "@/lib/receipt-view";
import { short } from "@/lib/chain";
import { FAUCET_URL } from "@/lib/wallet-help";

export { amountText };
export type { TokenMeta };

const runs = (n: number) => `${n} run${n === 1 ? "" : "s"}`;

// An attention run's clean payments are still counted — only its broken
// payment is left out (parent spec §4.2). The copy must not read as "the
// whole run is excluded" (Important 1).
function attentionNote(n: number): string | undefined {
  if (n === 0) return undefined;
  return n === 1
    ? "1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted."
    : `${n} runs have a payment that needs a look. Those payments are left out of the totals; the runs' other payments are counted.`;
}

/** For an `attention` run's Paid cell (Important 2): how many payments were
 *  left out of that run's own line, since the dashboard and `/run/[tx]`
 *  otherwise disagree on the figure with no explanation. */
export function excludedNote(n: number): string {
  return `${n} payment${n === 1 ? "" : "s"} excluded`;
}

export function paidLine(
  paid: Map<string, { value: bigint }>, order: string[], meta: Record<string, TokenMeta>,
): string {
  const parts = order
    .map((t) => {
      const got = [...paid.entries()].find(([k]) => k.toLowerCase() === t.toLowerCase());
      return got ? amountText(got[1].value, t, meta[t.toLowerCase()] ?? {}) : undefined;
    })
    .filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : "Nothing";
}

export type StatusColor = "success" | "warning" | "error" | "default";

/** A run's status in the payer's words (spec §3.3). "Read" used to mean paid. */
export function runStatus(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">): { label: string; color: StatusColor } {
  switch (read.state) {
    case "read": return { label: "Paid", color: "success" };
    case "attention": {
      const n = read.summary.identityBroken;
      return { label: n === 1 ? "Check one payment" : `Check ${n} payments`, color: "warning" };
    }
    case "not_found":
      return record.awaitingReceipt ? { label: "Waiting", color: "default" } : { label: "Not found", color: "default" };
    case "reverted": return { label: "Didn't go through", color: "error" };
    case "unreadable": return { label: "Couldn't check", color: "warning" };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** True when a block's timestamp falls in `now`'s calendar month, in the
 *  viewer's own time zone (spec decision 2). */
export function inMonth(paidAt: bigint, now: Date): boolean {
  const d = new Date(Number(paidAt) * 1000);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

type Counted = Extract<RunRead, { state: "read" | "attention" }>;
const counted = (reads: RunRead[]): Counted[] =>
  reads.filter((r): r is Counted => r.state === "read" || r.state === "attention");

/** This month's totals per token, from runs whose block is dated this month.
 *  A read run with no date is counted in `undated`, never guessed into a month. */
export function paidThisMonth(reads: RunRead[], tokens: Address[], now: Date): { totals: TokenTotal[]; undated: number } {
  const all = counted(reads);
  const dated = all.filter((r) => r.paidAt !== undefined);
  return {
    totals: paidByToken(dated.filter((r) => inMonth(r.paidAt!, now)).map((r) => r.summary), tokens),
    undated: all.length - dated.length,
  };
}

/** The all-time line under the tiles: tokens actually paid, in tile order. */
export function allTimeLine(reads: RunRead[], tokens: Address[], meta: Record<string, TokenMeta>): string {
  const paid = paidByToken(counted(reads).map((r) => r.summary), tokens).filter((t) => t.value > 0n);
  return paid.length
    ? paid.map((t) => amountText(t.value, t.token, meta[t.token.toLowerCase()] ?? {})).join(" · ")
    : "nothing yet";
}

export interface CoverageLine {
  text: string;
  /** No run could be read: a 0 on a tile would be a claim, so show "—". */
  tilesBlank: boolean;
}

/** The plain line under the totals (spec §3.3). Retry lives in Needs you, so
 *  this line only says what the figures stand on. */
export function coverageLine(c: Coverage, undated: number, networkName: string, now: Date): CoverageLine {
  if (c.total > 0 && c.covered === 0) {
    return { tilesBlank: true, text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  const parts = [c.total === 1
    ? `From the 1 run sent from this browser, read from Arc ${networkName}.`
    : `From ${c.total} runs sent from this browser, read from Arc ${networkName}.`];
  const m = c.missing.length;
  if (m > 0) parts.push(`${runs(m)} could not be read and ${m === 1 ? "is" : "are"} not counted.`);
  const month = MONTHS[now.getMonth()];
  if (undated > 0) {
    parts.push(undated === 1
      ? `1 run's date could not be read, so it is left out of ${month}.`
      : `${undated} runs' dates could not be read, so they are left out of ${month}.`);
  }
  const note = attentionNote(c.attention.length);
  if (note) parts.push(note);
  return { tilesBlank: false, text: parts.join(" ") };
}

/** The runs whose read may settle their history entry: successes only. A
 *  reverted run stays until the payer removes it (spec decision 4). */
export function toSettle(reads: RunRead[]): string[] {
  return counted(reads).map((r) => r.txHash);
}

/** The reverted runs: kept in the history and marked, so /runs says they did
 *  not go through rather than "no receipt yet" (spec decision 4). */
export function toMarkReverted(reads: RunRead[]): string[] {
  return reads.filter((r) => r.state === "reverted").map((r) => r.txHash);
}

/** The When column: the block's time, "Sending…" while a sent run waits for
 *  its receipt, otherwise "—". Never the browser's clock. */
export function whenText(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">, timeZone?: string): string {
  if ((read.state === "read" || read.state === "attention") && read.paidAt !== undefined) {
    return paidAtText(read.paidAt, timeZone);
  }
  if (read.state === "not_found" && record.awaitingReceipt) return "Sending…";
  return "—";
}

/** One wallet figure: "12.4 USDC", or "— USDC" when its balance could not be read. */
export function balanceText(value: bigint | undefined, token: string, meta: TokenMeta): string {
  if (value === undefined) return `— ${meta.symbol || short(token)}`;
  return amountText(value, token, meta);
}

export interface TokenCard {
  token: Address;
  /** From Ledgerline's own list, never the contract's symbol(), so it is there before any read. */
  label: string;
  /** The wallet's balance; undefined while it or the token's decimals are read. */
  balance: string | undefined;
  /** What it paid this month: null for no line at all, undefined while the runs are read. */
  paid: string | null | undefined;
}

/**
 * The wallet's tokens, each with what it holds beside what it paid this month,
 * so a payer sees what they can spend next to what they have spent. Every
 * token appears, in tile order. A figure waits for the token's on-chain
 * decimals rather than print in a guessed scale.
 */
export function tokenCards({ chainId, tokens, balances, meta, month, now }: {
  chainId: number;
  tokens: Address[];
  /** Keyed by lowercased token; a token whose read failed is absent. Undefined while reading. */
  balances: Record<string, bigint> | undefined;
  meta: Record<string, TokenMeta> | undefined;
  /** This month's totals in `tokens` order; null when there are no runs, undefined while they are read.
   *  `blank` when no run could be read, so a 0 would be a claim. */
  month: { totals: TokenTotal[]; blank: boolean } | null | undefined;
  now: Date | undefined;
}): TokenCard[] {
  const name = now ? MONTHS[now.getMonth()] : "this month";
  return tokens.map((token, i): TokenCard => {
    const k = token.toLowerCase();
    const m = meta?.[k] ?? {};
    const t = month?.totals[i];
    let paid: string | null | undefined;
    if (month === null) paid = null;
    else if (!month || !meta || !t) paid = undefined;
    else if (month.blank) paid = `Paid in ${name}: —`;
    else if (t.value === 0n) paid = `Nothing paid in ${name}`;
    else paid = `Paid in ${name}: ${amountText(t.value, token, m)} · ${t.payments} payment${t.payments === 1 ? "" : "s"}`;
    return {
      token,
      label: knownTokenSymbol(chainId, token) ?? short(token),
      balance: balances && meta ? balanceText(balances[k], token, m) : undefined,
      paid,
    };
  });
}

/** From this age, a run with no receipt gets the wording that stops a second
 *  payment (spec §3.3). Arc drops a fee under 20 Gwei without a word. */
export const STALE_AFTER_MS = 10 * 60_000;

export type NeedKind = "reverted" | "waiting" | "attention" | "unreadable" | "balances" | "no_fee";
export interface NeedItem {
  kind: NeedKind; key: string; text: string; txHash?: string; runLabel?: string;
  /** A waiting run past STALE_AFTER_MS: a replaced or dropped transaction
   *  never gets a receipt, so the payer can take it off the list. */
  stale?: boolean;
}

const NEED_ORDER: NeedKind[] = ["reverted", "waiting", "attention", "unreadable", "balances", "no_fee"];

/** 14:02, from this browser's clock: wording only, never evidence. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** How long a run has waited, in the unit a person would use. Only ever
 *  called from STALE_AFTER_MS up, so every unit is plural. */
const waited = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 120) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} hours` : `${Math.floor(hours / 24)} days`;
};

/**
 * What the payer has to do, one item per thing, in the order of NEED_ORDER
 * and newest run first within a kind (spec §3.3). Undefined while the run
 * reads or the balance read have not settled: an all-clear shown before then
 * would be a claim the page cannot make.
 */
export function needsYou({ records, reads, balances, tokens, usdc, now }: {
  records: RunRecord[];
  reads: RunRead[] | undefined;
  /** Keyed by lowercased token; a token whose read failed is absent. */
  balances: Record<string, bigint> | undefined;
  tokens: Address[];
  usdc: Address;
  now: number;
}): NeedItem[] | undefined {
  if (!reads || !balances) return undefined;
  const byHash = new Map(records.map((r) => [r.txHash.toLowerCase(), r]));
  const items: NeedItem[] = [];
  let unreadable = 0;
  for (const read of reads) {
    const rec = byHash.get(read.txHash.toLowerCase());
    const label = rec?.runLabel || "an unnamed run";
    const about = { txHash: read.txHash, runLabel: rec?.runLabel ?? "" };
    if (read.state === "reverted") {
      items.push({ ...about, kind: "reverted", key: `reverted:${read.txHash}`,
        text: `${cap(label)} did not go through. No money moved.` });
    } else if (read.state === "not_found" && rec?.awaitingReceipt) {
      const age = now - rec.seenAt;
      items.push(age < STALE_AFTER_MS
        ? { ...about, kind: "waiting", key: `waiting:${read.txHash}`,
          text: `${cap(label)} is waiting for the network (sent ${clock(rec.seenAt)}).` }
        : { ...about, kind: "waiting", key: `waiting:${read.txHash}`, stale: true,
          text: `Still no receipt for ${label} after ${waited(age)}. Open your wallet's activity before sending this run again: if it is still pending there, sending again could pay twice.` });
    } else if (read.state === "attention") {
      const n = read.summary.identityBroken;
      items.push({ ...about, kind: "attention", key: `attention:${read.txHash}`, text: n === 1
        ? `One payment in ${label} needs a look.`
        : `${n} payments in ${label} need a look.` });
    } else if (read.state === "unreadable") {
      unreadable++;
    }
  }
  if (unreadable > 0) {
    items.push({ kind: "unreadable", key: "unreadable", text: `Couldn't reach Arc to check ${runs(unreadable)}.` });
  }
  if (tokens.some((t) => balances[t.toLowerCase()] === undefined)) {
    items.push({ kind: "balances", key: "balances", text: "Couldn't read this wallet's balances." });
  }
  if (balances[usdc.toLowerCase()] === 0n) {
    items.push({ kind: "no_fee", key: "no_fee",
      text: "No USDC left for network fees. Arc takes its fee in USDC, so no run can be sent." });
  }
  // Array.prototype.sort is stable, so the history's newest-first order holds within a kind.
  return items.sort((a, b) => NEED_ORDER.indexOf(a.kind) - NEED_ORDER.indexOf(b.kind));
}

export interface FeeHelp { text: string; link?: { text: string; href: string } }

/** Where USDC for fees comes from: the faucet on testnet. On mainnet no bridge
 *  or swap link is verified, so words only (non-tech spec §10). */
export function feeHelp(network: "mainnet" | "testnet"): FeeHelp {
  return network === "testnet"
    ? { text: "Get free test USDC at", link: { text: "faucet.circle.com", href: FAUCET_URL } }
    : { text: "Add USDC to this wallet on Arc mainnet." };
}

export type StepState = "done" | "todo" | "unknown" | "loading";
export interface SetupStep { key: "wallet" | "network" | "fees" | "first"; title: string; state: StepState }

/** State B's checklist (spec §3.2). `balances` undefined means still reading;
 *  USDC absent from it means its read failed. */
export function setupSteps({ wrongChain, balances, usdc, network }: {
  wrongChain: boolean;
  balances: Record<string, bigint> | undefined;
  usdc: Address;
  network: "mainnet" | "testnet";
}): SetupStep[] {
  const held = balances?.[usdc.toLowerCase()];
  const fees: StepState = !balances ? "loading" : held === undefined ? "unknown" : held > 0n ? "done" : "todo";
  return [
    { key: "wallet", title: "Wallet connected", state: "done" },
    { key: "network", title: `On Arc ${network}`, state: wrongChain ? "todo" : "done" },
    { key: "fees", title: "USDC for network fees", state: fees },
    { key: "first", title: "Send your first run", state: "todo" },
  ];
}
