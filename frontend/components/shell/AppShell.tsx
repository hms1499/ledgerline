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
        <main id="main" className="app-main">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}
