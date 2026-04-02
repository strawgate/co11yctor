import type { FunctionComponent } from "preact";
import { fetchStats } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";

export const CollectorPage: FunctionComponent = () => {
  const { data: stats } = useQuery(() => fetchStats(), [], { refetchInterval: 5000 });

  return (
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Collector Insights</h1>
      </div>

      {/* Collector Status */}
      <div class="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <div class="flex items-center gap-4 mb-6">
          <div class="w-14 h-14 rounded-xl bg-indigo-600/20 flex items-center justify-center text-2xl">
            🔭
          </div>
          <div>
            <h2 class="text-lg font-semibold text-slate-200">OpenTelemetry Collector</h2>
            <p class="text-sm text-slate-500">
              Monitoring OTLP traffic on ports 4317 (gRPC) and 4318 (HTTP)
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="text-sm text-slate-400">Captured Spans</div>
            <div class="text-2xl font-bold text-indigo-400 mt-1">
              {(stats?.TotalSpans ?? 0).toLocaleString()}
            </div>
          </div>
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="text-sm text-slate-400">Captured Metrics</div>
            <div class="text-2xl font-bold text-cyan-400 mt-1">
              {(stats?.TotalMetrics ?? 0).toLocaleString()}
            </div>
          </div>
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="text-sm text-slate-400">Captured Logs</div>
            <div class="text-2xl font-bold text-emerald-400 mt-1">
              {(stats?.TotalLogs ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Configuration */}
      <div class="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <h2 class="text-lg font-semibold text-slate-200 mb-4">Pipeline Configuration</h2>
        <p class="text-sm text-slate-500 mb-4">
          Collector pipeline configuration is discovered by analyzing the telemetry data patterns
          and collector self-metrics (if exported).
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-lg">📥</span>
              <span class="text-sm font-semibold text-slate-300">Receivers</span>
            </div>
            <div class="text-xs text-slate-400 space-y-1">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400" />
                OTLP gRPC (:4317)
              </div>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400" />
                OTLP HTTP (:4318)
              </div>
            </div>
          </div>

          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-lg">📤</span>
              <span class="text-sm font-semibold text-slate-300">Exporters</span>
            </div>
            <div class="text-xs text-slate-400">
              <div class="text-slate-500 italic">
                Analyzing traffic patterns to detect exporters…
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Sources (Gateway scenario) */}
      <div class="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <h2 class="text-lg font-semibold text-slate-200 mb-4">Data Sources</h2>
        <p class="text-sm text-slate-500">
          In gateway mode, shows all hosts and services sending OTLP data through this collector.
          Source IPs are automatically discovered from captured traffic.
        </p>
      </div>
    </div>
  );
};
