import type { IconName } from "@/lib/nav";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  new: "M12 5v14M5 12h14",
  runs: "M5 6h14M5 12h14M5 18h9",
  learn: "M12 17v.01M12 13.5c0-2 2.5-2 2.5-4a2.5 2.5 0 0 0-5 0M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
};

export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
