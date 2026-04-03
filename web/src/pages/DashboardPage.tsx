import type { FunctionComponent } from "preact";
import { fetchStats } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import type { TelemetryEvent } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import type { Span, LogRecord } from "@/lib/types";

interface Props {
  events: TelemetryEvent[];
}

export const DashboardPage: FunctionComponent<Props> = ({ events }) => {
  const { data: stats } = useQuery(() => fetchStats(), [], { refetchInterval: 5000 });

  const recentSpans = events.filter((e) => e._type === "span").slice(0, 10) as (Span & {
    _type: string;
  })[];
  const recentLogs = events.filter((e) => e._type === "log").slice(0, 5) as (LogRecord & {
    _type: string;
  })[];

  // Compute rates from recent events
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const recentCount = events.filter((e) => {
    const ts = new Date("CapturedAt" in e ? (e as Span).CapturedAt : "").getTime();
    return ts > oneMinAgo;
  }).length;

  return (
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Dashboard</h1>
        <span class="text-sm text-slate-500">
          ~{recentCount} events/min
        </span>
      </div>

      {/* Stats Cards */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Spans" value={stats?.TotalSpans ?? 0} color="indigo" />
        <StatCard label="Total Metrics" value={stats?.TotalMetrics ?? 0} color="cyan" />
        <StatCard label="Total Logs" value={stats?.TotalLogs ?? 0} color="emerald" />
        <StatCard
          label="Live Events"
          value={events.length}
          color="amber"
        />
      </div>

      {/* Recent Activity */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Spans */}
        <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800">
            <h2 class="text-sm font-semibold text-slate-300">Recent Spans</h2>
          </div>
          <div class="divide-y divide-slate-800">
            {recentSpans.length === 0 ? (
              <div class="px-4 py-8 text-center text-slate-500 text-sm">
                Waiting for spans…
              </div>
            ) : (
              recentSpans.map((span, i) => (
                <div key={i} class="px-4 py-2 flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-indigo-400 truncate">{span.ServiceName || "—"}</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-slate-200 truncate">{span.Name || "—"}</span>
                  </div>
                  <span class="text-slate-500 text-xs whitespace-nowrap ml-2">
                    {formatDuration(span.StartTimeUnixNano, span.EndTimeUnixNano)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Logs */}
        <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800">
            <h2 class="text-sm font-semibold text-slate-300">Recent Logs</h2>
          </div>
          <div class="divide-y divide-slate-800">
            {recentLogs.length === 0 ? (
              <div class="px-4 py-8 text-center text-slate-500 text-sm">
                Waiting for logs…
              </div>
            ) : (
              recentLogs.map((log, i) => (
                <div key={i} class="px-4 py-2 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="text-emerald-400">{log.ServiceName || "—"}</span>
                    <span class="text-slate-500 text-xs">{log.SeverityText}</span>
                  </div>
                  <div class="text-slate-400 text-xs truncate mt-0.5">{log.Body || "—"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: number;
  color: string;
}

const colorMap: Record<string, string> = {
  indigo: "text-indigo-400",
  cyan: "text-cyan-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
};

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div class="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <div class="text-sm text-slate-400">{label}</div>
      <div class={`text-3xl font-bold mt-1 ${colorMap[color] || "text-white"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
