import type { FunctionComponent } from "preact";
import type { TelemetryEvent, Span, Metric, LogRecord } from "@/lib/types";
import { formatDuration, formatTime, truncate } from "@/lib/format";

interface Props {
  events: TelemetryEvent[];
  clearEvents: () => void;
}

export const LiveTailPage: FunctionComponent<Props> = ({ events, clearEvents }) => {
  return (
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-slate-100">Live Tail</h1>
          <span class="flex items-center gap-1.5 text-sm text-emerald-400">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Streaming
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500">{events.length} events</span>
          <button
            onClick={clearEvents}
            class="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden max-h-[calc(100vh-160px)] overflow-y-auto">
        {events.length === 0 ? (
          <div class="px-4 py-12 text-center text-slate-500">
            Waiting for events…
          </div>
        ) : (
          <div class="divide-y divide-slate-800/50">
            {events.map((event, i) => (
              <StreamItem key={i} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function StreamItem({ event }: { event: TelemetryEvent }) {
  const type = event._type || "event";
  const typeColors: Record<string, string> = {
    span: "text-indigo-400",
    metric: "text-cyan-400",
    log: "text-emerald-400",
    event: "text-slate-400",
  };
  const color = typeColors[type] || typeColors.event;

  let content: string;
  let detail = "";

  if (type === "span") {
    const span = event as unknown as Span;
    content = `${span.ServiceName || "?"} → ${span.Name || "?"}`;
    detail = formatDuration(span.StartTimeUnixNano, span.EndTimeUnixNano);
  } else if (type === "metric") {
    const metric = event as unknown as Metric;
    content = `${metric.ServiceName || "?"} ${metric.Name}`;
    detail = `= ${metric.Value}`;
  } else if (type === "log") {
    const log = event as unknown as LogRecord;
    content = `${log.ServiceName || "?"} [${log.SeverityText}]`;
    detail = truncate(log.Body, 80);
  } else {
    content = JSON.stringify(event).slice(0, 100);
  }

  const capturedAt =
    "CapturedAt" in event ? formatTime((event as unknown as Span).CapturedAt) : "";

  return (
    <div class="px-4 py-2 font-mono text-xs stream-item-enter flex items-center gap-2">
      <span class={`${color} w-16 flex-shrink-0`}>[{type}]</span>
      <span class="text-slate-300 flex-1 truncate">{content}</span>
      {detail && <span class="text-slate-500 flex-shrink-0">{detail}</span>}
      {capturedAt && <span class="text-slate-600 flex-shrink-0">{capturedAt}</span>}
    </div>
  );
}
