"use client";

import type { ReactNode } from "react";

export type ReviewTab = "problems" | "changes";

/** Problems | Changes, over the same edits (spec §5.4). Arrow keys move between the two tabs. */
export default function ReviewTabs({ tab, onTab, problems, changes, problemCount, changeCount }: {
  tab: ReviewTab;
  onTab: (t: ReviewTab) => void;
  problems: ReactNode;
  changes: ReactNode;
  problemCount: number;
  changeCount: number;
}) {
  const tabs: { key: ReviewTab; label: string }[] = [
    { key: "problems", label: `Problems ${problemCount}` },
    { key: "changes", label: `Changes ${changeCount}` },
  ];
  return (
    <div className="review-tabs">
      <div role="tablist" aria-label="Problems and changes">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? "is-on" : undefined}
            onClick={() => onTab(t.key)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = tabs[(i + 1) % tabs.length]!.key;
              onTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-problems" aria-labelledby="tab-problems" hidden={tab !== "problems"}>{problems}</div>
      <div role="tabpanel" id="panel-changes" aria-labelledby="tab-changes" hidden={tab !== "changes"}>{changes}</div>
    </div>
  );
}
