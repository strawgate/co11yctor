export function formatDuration(startNano: number, endNano: number): string {
  if (!startNano || !endNano) return "—";
  const ms = (endNano - startNano) / 1e6;
  if (ms < 0.001) return `${(ms * 1e6).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTime(ts: string | number): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString();
}

export function formatTimestamp(ts: string | number): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return d.toLocaleString();
}

export function truncate(str: string, n: number): string {
  if (!str) return "—";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

export function formatNanoTimestamp(nanos: number): string {
  if (!nanos) return "—";
  return new Date(nanos / 1e6).toLocaleTimeString();
}

export function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
