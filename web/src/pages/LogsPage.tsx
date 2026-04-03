import type { FunctionComponent } from "preact";
import { useState } from "preact/hooks";
import { fetchLogs } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { formatTime, truncate } from "@/lib/format";
import { protoBadge, severityBadge } from "@/components/Badge";
import type { TelemetryEvent, LogRecord } from "@/lib/types";

interface Props {
  events: TelemetryEvent[];
}

export const LogsPage: FunctionComponent<Props> = ({ events }) => {
  const [serviceFilter, setServiceFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [liveTail, setLiveTail] = useState(false);

  const { data: storedLogs, isLoading } = useQuery(
    () =>
      fetchLogs(200, {
        service: serviceFilter || undefined,
        severity: severityFilter || undefined,
      }),
    [serviceFilter, severityFilter],
    {
      refetchInterval: liveTail ? undefined : 10000,
    },
  );

  // Live logs from websocket
  const liveLogs = events.filter((e) => e._type === "log").slice(0, 200) as (LogRecord & {
    _type: string;
  })[];

  const logs = liveTail ? liveLogs : storedLogs || [];

  const services = [
    ...new Set((storedLogs || []).map((l) => l.ServiceName).filter(Boolean)),
  ].sort();

  return (
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Logs</h1>
        <div class="flex items-center gap-2">
          <select
            class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300"
            value={serviceFilter}
            onChange={(e) => setServiceFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300"
            value={severityFilter}
            onChange={(e) => setSeverityFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All severities</option>
            {["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            class={`px-3 py-1.5 rounded text-sm transition-colors ${
              liveTail
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
            onClick={() => setLiveTail(!liveTail)}
          >
            {liveTail ? "⚡ Live" : "⚡ Tail"}
          </button>
        </div>
      </div>

      <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 tracking-wider">
              <th class="px-4 py-3">Time</th>
              <th class="px-4 py-3">Service</th>
              <th class="px-4 py-3">Severity</th>
              <th class="px-4 py-3">Body</th>
              <th class="px-4 py-3">Trace ID</th>
              <th class="px-4 py-3">Proto</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            {isLoading && !liveTail ? (
              <tr>
                <td colSpan={6} class="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : !logs.length ? (
              <tr>
                <td colSpan={6} class="px-4 py-8 text-center text-slate-500">
                  {liveTail ? "Waiting for logs…" : "No logs captured yet."}
                </td>
              </tr>
            ) : (
              logs.map((log, i) => (
                <tr
                  key={i}
                  class={`hover:bg-slate-800/50 transition-colors ${liveTail ? "stream-item-enter" : ""}`}
                >
                  <td class="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {formatTime(log.CapturedAt)}
                  </td>
                  <td class="px-4 py-2 text-sm text-emerald-400">{log.ServiceName || "—"}</td>
                  <td class="px-4 py-2">{severityBadge(log.SeverityText)}</td>
                  <td class="px-4 py-2 text-sm text-slate-300 max-w-md truncate">
                    {truncate(log.Body, 80)}
                  </td>
                  <td class="px-4 py-2 text-xs font-mono text-slate-500">
                    {truncate(log.TraceID, 12)}
                  </td>
                  <td class="px-4 py-2">{protoBadge(log.Proto)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
