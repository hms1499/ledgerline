import SideNav from "./SideNav";
import TopBar from "./TopBar";
import BottomTabs from "./BottomTabs";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <SideNav />
      <div className="app-body">
        <TopBar />
        {/* One frame for the title above and the page below (spec §5.2). */}
        <main id="main" className="app-main">
          <div className="frame">{children}</div>
        </main>
      </div>
      <BottomTabs />
    </div>
  );
}
