import { Suspense } from "react";
import PublicShell from "@/components/shell/PublicShell";

// useSearchParams (the ?n= network badge) inside the shell needs a boundary.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <PublicShell>{children}</PublicShell>
    </Suspense>
  );
}
