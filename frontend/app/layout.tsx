import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Atkinson_Hyperlegible, Martian_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { tokenCss } from "@/lib/theme-tokens";
import { resolveTheme, BOOT_SCRIPT, THEME_COOKIE, SYSTEM_COOKIE } from "@/lib/theme";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/tape.css";
import "./styles/antd.css";
import "./styles/pages.css";

// Atkinson for sentences. Martian, variable with its width axis, for all the
// machine prints: labels at 87% width, amounts at 100% (spec §4.3).
const sans = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans" });
const mono = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://ledgerline-chi-sandy.vercel.app"),
  title: "Ledgerline",
  description: "Verify a stablecoin payout on Arc without trusting the payer.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Ledgerline",
    title: "Ledgerline — a stablecoin payout that carries its own invoice",
    description:
      "Pay a list of invoices in one transaction on Arc. Each payment records which invoice it settles, on chain, so the payer and the person paid can each check it without trusting us.",
  },
  twitter: {
    card: "summary",
    title: "Ledgerline — a stablecoin payout that carries its own invoice",
    description:
      "Pay a list of invoices in one transaction on Arc, each payment carrying its own invoice reference on chain.",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so the first HTML already carries the right theme —
  // antd colours in JS, and a client-only switch would flash.
  const jar = await cookies();
  const initial = resolveTheme(jar.get(THEME_COOKIE)?.value, jar.get(SYSTEM_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      data-theme={initial.mode}
      data-theme-choice={initial.choice}
      // The boot script may change data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokenCss() }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        {/* Without this wrapper antd's styles arrive after first paint and the
            page flashes unstyled on SSR. */}
        <AntdRegistry>
          <ThemeProvider initial={initial}>{children}</ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
