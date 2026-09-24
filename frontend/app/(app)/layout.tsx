import { Suspense } from "react";
import AppShell from "@/components/shell/AppShell";
import { WalletProvider } from "@/components/wallet/WalletProvider";

// useSearchParams (the ?n= network) inside the provider needs a boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <WalletProvider>
        <AppShell>{children}</AppShell>
      </WalletProvider>
    </Suspense>
  );
}
