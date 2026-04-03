import { useState } from "preact/hooks";
import { Layout } from "@/components/Layout";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DashboardPage } from "@/pages/DashboardPage";
import { TracesPage } from "@/pages/TracesPage";
import { LogsPage } from "@/pages/LogsPage";
import { MetricsPage } from "@/pages/MetricsPage";
import { ServicesPage } from "@/pages/ServicesPage";
import { LiveTailPage } from "@/pages/LiveTailPage";
import { CollectorPage } from "@/pages/CollectorPage";

export function App() {
  const [currentPath, setCurrentPath] = useState("/");
  const { connected, events, clearEvents } = useWebSocket(500);

  function renderPage() {
    switch (currentPath) {
      case "/":
        return <DashboardPage events={events} />;
      case "/traces":
        return <TracesPage />;
      case "/logs":
        return <LogsPage events={events} />;
      case "/metrics":
        return <MetricsPage />;
      case "/services":
        return <ServicesPage />;
      case "/live":
        return <LiveTailPage events={events} clearEvents={clearEvents} />;
      case "/collector":
        return <CollectorPage />;
      default:
        return <DashboardPage events={events} />;
    }
  }

  return (
    <Layout connected={connected} currentPath={currentPath} onNavigate={setCurrentPath}>
      {renderPage()}
    </Layout>
  );
}
