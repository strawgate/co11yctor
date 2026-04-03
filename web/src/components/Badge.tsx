import type { FunctionComponent } from "preact";

interface BadgeProps {
  text: string;
  variant: "grpc" | "http" | "ok" | "error" | "info" | "warn" | "default";
}

const variantClasses: Record<string, string> = {
  grpc: "bg-indigo-900/50 text-indigo-300",
  http: "bg-sky-900/50 text-sky-300",
  ok: "bg-emerald-900/50 text-emerald-300",
  error: "bg-red-900/50 text-red-300",
  info: "bg-blue-900/50 text-blue-300",
  warn: "bg-amber-900/50 text-amber-300",
  default: "bg-slate-700/50 text-slate-300",
};

export const Badge: FunctionComponent<BadgeProps> = ({ text, variant }) => {
  const classes = variantClasses[variant] || variantClasses.default;
  return (
    <span class={`inline-block text-xs font-mono px-1.5 py-0.5 rounded ${classes}`}>{text}</span>
  );
};

export function protoBadge(proto: string) {
  const p = (proto || "http").toLowerCase();
  return <Badge text={p} variant={p === "grpc" ? "grpc" : "http"} />;
}

export function statusBadge(code: number) {
  return code === 1 ? <Badge text="OK" variant="ok" /> : <Badge text="ERR" variant="error" />;
}

export function severityBadge(severity: string) {
  const s = (severity || "").toLowerCase();
  if (s.includes("error") || s.includes("fatal")) return <Badge text={severity} variant="error" />;
  if (s.includes("warn")) return <Badge text={severity} variant="warn" />;
  if (s.includes("info")) return <Badge text={severity} variant="info" />;
  return <Badge text={severity || "—"} variant="default" />;
}
