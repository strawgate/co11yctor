import type { Span, Metric, LogRecord, Stats } from "./types";

const BASE_URL = "";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Spans
export function fetchSpans(limit = 100, filter?: string): Promise<Span[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filter) params.set("filter", filter);
  return fetchJSON<Span[]>(`/api/spans?${params}`);
}

export function fetchSpansByTraceID(traceID: string): Promise<Span[]> {
  return fetchJSON<Span[]>(`/api/spans?trace_id=${encodeURIComponent(traceID)}`);
}

// Metrics
export function fetchMetrics(limit = 100, filter?: string): Promise<Metric[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filter) params.set("filter", filter);
  return fetchJSON<Metric[]>(`/api/metrics?${params}`);
}

// Logs
export function fetchLogs(limit = 100, filter?: string): Promise<LogRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filter) params.set("filter", filter);
  return fetchJSON<LogRecord[]>(`/api/logs?${params}`);
}

// Stats
export function fetchStats(): Promise<Stats> {
  return fetchJSON<Stats>("/api/stats");
}

// Services
export function fetchServices(): Promise<string[]> {
  return fetchJSON<string[]>("/api/services");
}

// Service map (edges between services)
export interface ServiceEdge {
  source: string;
  target: string;
  count: number;
}

export function fetchServiceMap(): Promise<ServiceEdge[]> {
  return fetchJSON<ServiceEdge[]>("/api/service-map");
}
