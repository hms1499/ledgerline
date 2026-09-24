"use client";

/**
 * Runs this browser has seen a payer send, so the result screen's "keep two
 * things — the hash and the run name" becomes "keep neither, on this machine".
 *
 * The run name is stored with the hash, and that is safe: the salt is
 * keccak256 of a *signature* over that name, so the name alone is inert.
 * Anyone holding it still needs the payer's key to produce the signature,
 * which is the same thing they would need to move the money. What must never
 * be stored is the salt itself, and this stores no salt.
 *
 * This is a convenience, never a source of truth. Invariant 1 holds because
 * nothing here is consulted to decide anything: every run opened from this
 * list is re-read and re-verified from the chain, exactly as one opened from a
 * pasted hash. Clearing site data, switching browser or switching machine
 * loses the list and loses nothing else — which is precisely why recovery by
 * signature has to exist, and why this cannot replace it.
 */
const KEY = "ledgerline:runs:v1";
const MAX_PER_PAYER = 50;

export interface RunRecord {
  txHash: string;
  payer: string;
  chainId: number;
  /** What the payer called it — needed to re-derive the salt by signing. */
  runLabel: string;
  /** Epoch ms, this browser's clock — a label for the list, never evidence. */
  seenAt: number;
  itemCount: number;
}

type Store = Record<string, RunRecord[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    // Private mode, blocked storage, or something else wrote nonsense here.
    // A history that cannot be read is an empty history, never an error.
    return {};
  }
}

function write(store: Store): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* over quota or blocked; the run is on chain either way */ }
}

const keyFor = (payer: string, chainId: number) => `${payer.toLowerCase()}:${chainId}`;

export function recordRun(run: RunRecord): void {
  if (typeof window === "undefined") return;
  const store = read();
  const k = keyFor(run.payer, run.chainId);
  const existing = (store[k] ?? []).filter(
    (r) => r.txHash.toLowerCase() !== run.txHash.toLowerCase(),
  );
  store[k] = [run, ...existing].slice(0, MAX_PER_PAYER);
  write(store);
}

/** Newest first. */
export function runsFor(payer: string, chainId: number): RunRecord[] {
  const list = read()[keyFor(payer, chainId)] ?? [];
  return [...list].sort((a, b) => b.seenAt - a.seenAt);
}

export function forgetRun(txHash: string, payer: string, chainId: number): void {
  const store = read();
  const k = keyFor(payer, chainId);
  store[k] = (store[k] ?? []).filter((r) => r.txHash.toLowerCase() !== txHash.toLowerCase());
  write(store);
}
