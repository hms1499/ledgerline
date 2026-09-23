import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { tokenCss } from "@/lib/theme-tokens";
import { resolveTheme, BOOT_SCRIPT, THEME_COOKIE, SYSTEM_COOKIE } from "@/lib/theme";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Ledgerline",
  description: "Verify a stablecoin payout on Arc without trusting the payer.",
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
