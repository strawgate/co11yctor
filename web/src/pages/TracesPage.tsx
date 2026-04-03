import type { FunctionComponent } from "preact";
import { useState } from "preact/hooks";
import { fetchSpans, fetchSpansByTraceID } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { formatDuration, formatTime, truncate } from "@/lib/format";
import { protoBadge, statusBadge } from "@/components/Badge";
import type { Span } from "@/lib/types";

export const TracesPage: FunctionComponent = () => {
  const [selectedTraceID, setSelectedTraceID] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("");

  const { data: spans, isLoading } = useQuery(
    () => fetchSpans(200, { service: serviceFilter || undefined }),
    [serviceFilter],
    {
      refetchInterval: 10000,
    },
  );

  const { data: traceSpans } = useQuery(
    () => fetchSpansByTraceID(selectedTraceID!),
    [selectedTraceID],
    { enabled: !!selectedTraceID },
  );

  // Extract unique services for filter dropdown
  const services = [...new Set((spans || []).map((s) => s.ServiceName).filter(Boolean))].sort();

  if (selectedTraceID && traceSpans) {
    return (
      <TraceDetail
        traceID={selectedTraceID}
        spans={traceSpans}
        onBack={() => setSelectedTraceID(null)}
      />
    );
  }

  return (
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Traces</h1>
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
        </div>
      </div>

      <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 tracking-wider">
              <th class="px-4 py-3">Service</th>
              <th class="px-4 py-3">Operation</th>
              <th class="px-4 py-3">Trace ID</th>
              <th class="px-4 py-3">Duration</th>
              <th class="px-4 py-3">Status</th>
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
            ) : !spans?.length ? (
              <tr>
                <td colSpan={7} class="px-4 py-8 text-center text-slate-500">
                  No spans captured yet.
                </td>
              </tr>
            ) : (
              spans.map((span, i) => (
                <tr
                  key={i}
                  class="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedTraceID(span.TraceID)}
                >
                  <td class="px-4 py-2.5 text-sm text-indigo-400">{span.ServiceName || "—"}</td>
                  <td class="px-4 py-2.5 text-sm text-slate-200">{span.Name || "—"}</td>
                  <td class="px-4 py-2.5 text-xs font-mono text-slate-500">
                    {truncate(span.TraceID, 16)}
                  </td>
                  <td class="px-4 py-2.5 text-sm">
                    {formatDuration(span.StartTimeUnixNano, span.EndTimeUnixNano)}
                  </td>
                  <td class="px-4 py-2.5">{statusBadge(span.StatusCode)}</td>
                  <td class="px-4 py-2.5">{protoBadge(span.Proto)}</td>
                  <td class="px-4 py-2.5 text-xs text-slate-500">{formatTime(span.CapturedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Trace detail waterfall view
interface TraceDetailProps {
  traceID: string;
  spans: Span[];
  onBack: () => void;
}

function TraceDetail({ traceID, spans, onBack }: TraceDetailProps) {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  // Calculate trace time range
  const minStart = Math.min(...spans.map((s) => s.StartTimeUnixNano));
  const maxEnd = Math.max(...spans.map((s) => s.EndTimeUnixNano));
  const totalDuration = maxEnd - minStart;

  // Build tree and sort
  const sortedSpans = [...spans].sort((a, b) => a.StartTimeUnixNano - b.StartTimeUnixNano);

  return (
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-4">
        <button
          onClick={onBack}
          class="text-slate-400 hover:text-slate-200 transition-colors text-sm"
        >
          ← Back to traces
        </button>
        <h1 class="text-xl font-bold text-slate-100">Trace {truncate(traceID, 24)}</h1>
        <span class="text-sm text-slate-500">
          {spans.length} spans · {formatDuration(minStart, maxEnd)}
        </span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Waterfall */}
        <div class="lg:col-span-2 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800">
            <h2 class="text-sm font-semibold text-slate-300">Waterfall</h2>
          </div>
          <div class="divide-y divide-slate-800">
            {sortedSpans.map((span, i) => {
              const left =
                totalDuration > 0
                  ? ((span.StartTimeUnixNano - minStart) / totalDuration) * 100
                  : 0;
              const width =
                totalDuration > 0
                  ? ((span.EndTimeUnixNano - span.StartTimeUnixNano) / totalDuration) * 100
                  : 100;
              const isSelected = selectedSpan?.SpanID === span.SpanID;

              return (
                <div
                  key={i}
                  class={`px-4 py-2 cursor-pointer transition-colors ${
                    isSelected ? "bg-indigo-900/30" : "hover:bg-slate-800/50"
                  }`}
                  onClick={() => setSelectedSpan(span)}
                >
                  <div class="flex items-center gap-2 text-sm mb-1">
                    <span class="text-indigo-400 text-xs w-20 truncate">{span.ServiceName}</span>
                    <span class="text-slate-300 truncate flex-1">{span.Name}</span>
                    <span class="text-slate-500 text-xs">
                      {formatDuration(span.StartTimeUnixNano, span.EndTimeUnixNano)}
                    </span>
                  </div>
                  <div class="relative h-4 bg-slate-800 rounded">
                    <div
                      class="absolute top-0 h-full bg-indigo-500/60 rounded trace-bar"
                      style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Span Detail Panel */}
        <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800">
            <h2 class="text-sm font-semibold text-slate-300">Span Details</h2>
          </div>
          {selectedSpan ? (
            <div class="p-4 space-y-3 text-sm">
              <DetailRow label="Service" value={selectedSpan.ServiceName} />
              <DetailRow label="Operation" value={selectedSpan.Name} />
              <DetailRow label="Span ID" value={selectedSpan.SpanID} mono />
              <DetailRow label="Parent ID" value={selectedSpan.ParentSpanID || "root"} mono />
              <DetailRow
                label="Duration"
                value={formatDuration(
                  selectedSpan.StartTimeUnixNano,
                  selectedSpan.EndTimeUnixNano,
                )}
              />
              <DetailRow label="Status" value={selectedSpan.StatusCode === 1 ? "OK" : "Error"} />
              <DetailRow label="Source IP" value={selectedSpan.SourceIP} />
              <DetailRow label="Proto" value={selectedSpan.Proto} />
              {selectedSpan.Attributes &&
                Object.entries(selectedSpan.Attributes).length > 0 && (
                  <div>
                    <div class="text-slate-500 text-xs uppercase mb-1">Attributes</div>
                    {Object.entries(selectedSpan.Attributes).map(([k, v]) => (
                      <div key={k} class="flex gap-2 text-xs py-0.5">
                        <span class="text-indigo-300">{k}:</span>
                        <span class="text-slate-400">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          ) : (
            <div class="p-4 text-sm text-slate-500 text-center">Click a span to see details</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div class="text-slate-500 text-xs">{label}</div>
      <div class={`text-slate-200 ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
    </div>
  );
}
