import type { FunctionComponent, ComponentChildren } from "preact";

interface Props {
  connected: boolean;
  currentPath: string;
  onNavigate: (path: string) => void;
  children: ComponentChildren;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/traces", label: "Traces", icon: "🔗" },
  { path: "/logs", label: "Logs", icon: "📋" },
  { path: "/metrics", label: "Metrics", icon: "📈" },
  { path: "/services", label: "Services", icon: "🗺️" },
  { path: "/live", label: "Live Tail", icon: "⚡" },
  { path: "/collector", label: "Collector", icon: "🔭" },
];

export const Layout: FunctionComponent<Props> = ({
  connected,
  currentPath,
  onNavigate,
  children,
}) => {
  return (
    <div class="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside class="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div class="px-4 py-4 border-b border-slate-800">
          <div class="flex items-center gap-2">
            <span class="text-xl">🔭</span>
            <span class="text-lg font-bold text-indigo-400">co11yctor</span>
          </div>
          <div class="text-xs text-slate-500 mt-0.5">eBPF OTLP Observer</div>
        </div>

        {/* Navigation */}
        <nav class="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              class={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                currentPath === item.path
                  ? "bg-indigo-600/20 text-indigo-300 border-r-2 border-indigo-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Status */}
        <div class="px-4 py-3 border-t border-slate-800 flex items-center gap-2 text-xs">
          <span
            class={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400 shadow-emerald-400/50 shadow-sm" : "bg-red-400"
            }`}
          />
          <span class={connected ? "text-slate-400" : "text-red-400"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </aside>

      {/* Main Content */}
      <main class="flex-1 overflow-y-auto bg-slate-950">{children}</main>
    </div>
  );
};
