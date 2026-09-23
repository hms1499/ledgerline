import Link from "next/link";
import NetworkBadge from "./NetworkBadge";
import ThemeToggle from "./ThemeToggle";
import MoreMenu from "./MoreMenu";

/** For people who were sent a link, or are deciding whether to use the app.
 *  No wallet: a recipient reading a receipt has nothing to connect. */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="public-bar">
        <div className="public-bar-inner">
          <Link href="/" className="side-brand">Ledgerline</Link>
          <nav className="public-links" aria-label="Main">
            <Link href="/why" className="hide-sm">How it works</Link>
            <NetworkBadge />
            <span className="hide-sm"><ThemeToggle /></span>
            <span className="only-sm"><MoreMenu /></span>
            <Link href="/dashboard" className="button-primary">Open app</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="public-main">{children}</main>
    </div>
  );
}
