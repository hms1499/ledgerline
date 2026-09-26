import { describe, it, expect } from "vitest";
import {
  DRAFT_PREFIX, draftKey, draftPrompt, dropDraft, loadDraft, saveDraft, type DraftStorage,
} from "@/lib/draft-store";
import { NO_EDITS, editCells } from "@/lib/sheet-edits";

/** `localStorage`'s shape, in memory. */
class Memory implements DraftStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

/** A browser that refuses to store anything. */
class Refusing extends Memory {
  override setItem(): void { throw new DOMException("QuotaExceededError"); }
}

const DAY = 24 * 60 * 60 * 1000;
const E = editCells(NO_EDITS, [{ line: 2, col: "f3", text: "1300" }]);

describe("draftKey", () => {
  it("is the same for the same file and different for another", async () => {
    const a = await draftKey("invoiceId,token,to,amount\n1");
    expect(a.startsWith(DRAFT_PREFIX)).toBe(true);
    expect(a).toHaveLength(DRAFT_PREFIX.length + 64);
    expect(await draftKey("invoiceId,token,to,amount\n1")).toBe(a);
    expect(await draftKey("invoiceId,token,to,amount\n2")).not.toBe(a);
  });
});

describe("saveDraft and loadDraft", () => {
  it("keeps the edits for the file and gives them back", () => {
    const s = new Memory();
    expect(saveDraft(s, "k", E, 1000)).toBe(true);
    expect(loadDraft(s, "k", 2000)).toEqual({ v: 1, savedAt: 1000, edits: E });
  });

  it("says so when the browser refuses, and gives nothing back without storage", () => {
    expect(saveDraft(new Refusing(), "k", E, 1)).toBe(false);
    expect(saveDraft(undefined, "k", E, 1)).toBe(false);
    expect(loadDraft(undefined, "k", 1)).toBeUndefined();
  });

  it("ignores a draft of another version, a malformed one, and one older than 30 days", () => {
    const s = new Memory();
    s.setItem("old-version", JSON.stringify({ savedAt: 1, edits: E }));
    s.setItem("garbage", "{not json");
    s.setItem("shapeless", JSON.stringify({ v: 1, savedAt: 1, edits: { cells: {} } }));
    expect(loadDraft(s, "old-version", 2)).toBeUndefined();
    expect(loadDraft(s, "garbage", 2)).toBeUndefined();
    expect(loadDraft(s, "shapeless", 2)).toBeUndefined();
    saveDraft(s, `${DRAFT_PREFIX}a`, E, 0);
    expect(loadDraft(s, `${DRAFT_PREFIX}a`, 31 * DAY)).toBeUndefined();
  });

  it("keeps the newest five drafts and drops any older than 30 days, leaving other keys alone", () => {
    const s = new Memory();
    s.setItem("theme", "dark");
    for (let i = 1; i <= 6; i++) saveDraft(s, `${DRAFT_PREFIX}${i}`, E, 40 * DAY + i);
    expect(s.keys().filter((k) => k.startsWith(DRAFT_PREFIX)).sort()).toEqual([2, 3, 4, 5, 6].map((i) => `${DRAFT_PREFIX}${i}`));
    saveDraft(s, `${DRAFT_PREFIX}new`, E, 71 * DAY);
    expect(s.keys().filter((k) => k.startsWith(DRAFT_PREFIX))).toEqual([`${DRAFT_PREFIX}new`]);
    expect(s.getItem("theme")).toBe("dark");
  });

  it("drops a draft, and does not throw without storage", () => {
    const s = new Memory();
    saveDraft(s, "k", E, 1);
    dropDraft(s, "k");
    expect(s.getItem("k")).toBeNull();
    expect(() => dropDraft(undefined, "k")).not.toThrow();
  });
});

describe("draftPrompt", () => {
  it("counts the changes and says when they were made", () => {
    expect(draftPrompt(12, Date.UTC(2026, 8, 26, 7, 2))).toMatch(/^You have 12 changes to this file from .+\.$/);
    expect(draftPrompt(1, Date.UTC(2026, 8, 26, 7, 2))).toMatch(/^You have 1 change to this file from /);
  });
});
