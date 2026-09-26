import type { SheetEdits } from "@/lib/sheet-edits";

export const DRAFT_PREFIX = "ledgerline:draft:";
export const DRAFT_SAVED = "Draft saved in this browser only";
export const DRAFT_REFUSED = "Changes can't be saved in this browser";
const KEEP = 5;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/** What is kept: the edits, never the file. */
export interface Draft { v: 1; savedAt: number; edits: SheetEdits }

/** The part of `Storage` a draft needs, so a test can pass a fake. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** This browser's storage, or undefined where it is refused: reading
 *  `localStorage` itself throws in some private windows. */
export function browserStorage(): DraftStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** One file's key: its text, hashed, so the same file finds its draft and
 *  another never does. */
export async function draftKey(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return DRAFT_PREFIX + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isEdits = (x: unknown): x is SheetEdits => {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<SheetEdits>;
  return [e.newColumns, e.newLines, e.deleted, e.leftOut, e.batches].every(Array.isArray)
    && typeof e.cells === "object" && e.cells !== null && typeof e.roles === "object" && e.roles !== null;
};

export function loadDraft(store: DraftStorage | undefined, key: string, now: number): Draft | undefined {
  try {
    const raw = store?.getItem(key);
    if (!raw) return undefined;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (d.v !== 1 || typeof d.savedAt !== "number" || now - d.savedAt > MAX_AGE || !isEdits(d.edits)) return undefined;
    return { v: 1, savedAt: d.savedAt, edits: d.edits };
  } catch {
    return undefined;
  }
}

/** False when storage refused the write. Keeps the newest five drafts and
 *  drops any older than 30 days. */
export function saveDraft(store: DraftStorage | undefined, key: string, edits: SheetEdits, now: number): boolean {
  if (!store) return false;
  try {
    const draft: Draft = { v: 1, savedAt: now, edits };
    store.setItem(key, JSON.stringify(draft));
    prune(store, now);
    return true;
  } catch {
    return false;
  }
}

export function dropDraft(store: DraftStorage | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing to drop where nothing could be kept.
  }
}

function prune(store: DraftStorage, now: number) {
  const drafts: { key: string; savedAt: number }[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    let savedAt = 0;
    try {
      savedAt = (JSON.parse(store.getItem(key) ?? "{}") as Partial<Draft>).savedAt ?? 0;
    } catch {
      // Unreadable: treated as the oldest.
    }
    drafts.push({ key, savedAt });
  }
  drafts.sort((a, b) => b.savedAt - a.savedAt);
  drafts.forEach((d, i) => { if (i >= KEEP || now - d.savedAt > MAX_AGE) store.removeItem(d.key); });
}

/** "You have 12 changes to this file from Sep 26, 14:02." In the payer's own time and format. */
export function draftPrompt(changes: number, savedAt: number): string {
  const when = new Date(savedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `You have ${changes} change${changes === 1 ? "" : "s"} to this file from ${when}.`;
}
