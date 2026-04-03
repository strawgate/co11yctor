import type { FunctionComponent } from "preact";
import { useState } from "preact/hooks";
import { fetchMetrics } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { formatTime } from "@/lib/format";
import { protoBadge } from "@/components/Badge";

export const MetricsPage: FunctionComponent = () => {
  const [serviceFilter, setServiceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data: metrics, isLoading } = useQuery(
    () =>
      fetchMetrics(200, {
        service: serviceFilter || undefined,
        dataType: typeFilter || undefined,
      }),
    [serviceFilter, typeFilter],
    {
      refetchInterval: 10000,
    },
  );

  const services = [
    ...new Set((metrics || []).map((m) => m.ServiceName).filter(Boolean)),
  ].sort();

  const types = [...new Set((metrics || []).map((m) => m.DataType).filter(Boolean))].sort();

  return (
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Metrics</h1>
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
            value={typeFilter}
            onChange={(e) => setTypeFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 tracking-wider">
              <th class="px-4 py-3">Service</th>
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Value</th>
              <th class="px-4 py-3">Unit</th>
              <th class="px-4 py-3">Proto</th>
              <th class="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={7} class="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : !metrics?.length ? (
              <tr>
                <td colSpan={7} class="px-4 py-8 text-center text-slate-500">
                  No metrics captured yet.
                </td>
              </tr>
            ) : (
              metrics.map((m, i) => (
                <tr key={i} class="hover:bg-slate-800/50 transition-colors">
                  <td class="px-4 py-2.5 text-sm text-cyan-400">{m.ServiceName || "—"}</td>
                  <td class="px-4 py-2.5 text-sm text-slate-200">{m.Name || "—"}</td>
                  <td class="px-4 py-2.5 text-xs text-slate-400">{m.DataType || "—"}</td>
                  <td class="px-4 py-2.5 text-sm font-mono text-cyan-300">
                    {m.Value !== undefined ? m.Value.toFixed(4) : "—"}
                  </td>
                  <td class="px-4 py-2.5 text-xs text-slate-500">{m.Unit || "—"}</td>
                  <td class="px-4 py-2.5">{protoBadge(m.Proto)}</td>
                  <td class="px-4 py-2.5 text-xs text-slate-500">{formatTime(m.CapturedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
