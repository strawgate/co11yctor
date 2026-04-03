import type { FunctionComponent } from "preact";
import { fetchDataSources, fetchStats } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import type { DataSource } from "@/lib/types";

export const CollectorPage: FunctionComponent = () => {
  const { data: stats } = useQuery(() => fetchStats(), [], { refetchInterval: 5000 });
  const { data: dataSources, isLoading } = useQuery(() => fetchDataSources(), [], {
    refetchInterval: 5000,
  });

  const topSources = (dataSources || []).slice(0, 8);
  const totalSources = new Set((dataSources || []).map((item) => item.sourceIp)).size;
  const totalServices = new Set((dataSources || []).map((item) => item.serviceName)).size;

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
      <div class="bg-slate-900 rounded-lg border border-slate-800 p-6 space-y-4">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-slate-200">Data Sources</h2>
            <p class="text-sm text-slate-500">
              Hosts and services currently sending OTLP traffic through the collector.
            </p>
          </div>
          <div class="flex gap-3 text-xs">
            <SummaryPill label="Source IPs" value={totalSources} />
            <SummaryPill label="Services" value={totalServices} />
            <SummaryPill label="Streams" value={dataSources?.length ?? 0} />
          </div>
        </div>

        {isLoading ? (
          <div class="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-8 text-center text-sm text-slate-500">
            Discovering source hosts…
          </div>
        ) : !topSources.length ? (
          <div class="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-8 text-center">
            <div class="text-3xl mb-3">📡</div>
            <p class="text-sm text-slate-400">No telemetry sources discovered yet.</p>
            <p class="text-xs text-slate-500 mt-1">
              Start sending OTLP traffic to populate gateway insights automatically.
            </p>
          </div>
        ) : (
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {topSources.map((source) => (
              <DataSourceCard key={`${source.sourceIp}-${source.serviceName}`} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div class="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-slate-400">
      <span class="text-slate-500">{label}</span>{" "}
      <span class="font-semibold text-slate-200">{value.toLocaleString()}</span>
    </div>
  );
}

function DataSourceCard({ source }: { source: DataSource }) {
  const totalEvents = source.spanCount + source.metricCount + source.logCount;

  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-wide text-slate-500">Source IP</div>
          <div class="font-mono text-sm text-cyan-300 truncate">{source.sourceIp}</div>
          <div class="mt-3 text-xs uppercase tracking-wide text-slate-500">Service</div>
          <div class="text-sm font-semibold text-slate-200 truncate">{source.serviceName}</div>
        </div>
        <div class="rounded-lg bg-indigo-500/10 px-3 py-2 text-right">
          <div class="text-xs text-slate-500">Total</div>
          <div class="text-lg font-bold text-indigo-300">{totalEvents.toLocaleString()}</div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-3 gap-3 text-center">
        <MetricChip label="Spans" value={source.spanCount} tone="indigo" />
        <MetricChip label="Metrics" value={source.metricCount} tone="cyan" />
        <MetricChip label="Logs" value={source.logCount} tone="emerald" />
      </div>

      <div class="mt-4 text-xs text-slate-500">
        Last seen <span class="text-slate-400">{formatLastSeen(source.lastSeen)}</span>
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "indigo" | "cyan" | "emerald";
}) {
  const tones = {
    indigo: "bg-indigo-500/10 text-indigo-300",
    cyan: "bg-cyan-500/10 text-cyan-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
  };

  return (
    <div class={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <div class="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div class="mt-1 text-base font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return date.toLocaleString();
}
