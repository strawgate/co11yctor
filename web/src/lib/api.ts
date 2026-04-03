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
export interface SpanQuery {
  service?: string;
  traceID?: string;
}

export function fetchSpans(limit = 100, query: SpanQuery = {}): Promise<Span[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.service) params.set("service", query.service);
  if (query.traceID) params.set("trace_id", query.traceID);
  return fetchJSON<Span[]>(`/api/spans?${params}`);
}

export function fetchSpansByTraceID(traceID: string): Promise<Span[]> {
  return fetchJSON<Span[]>(`/api/spans?trace_id=${encodeURIComponent(traceID)}`);
}

// Metrics
export interface MetricQuery {
  service?: string;
  dataType?: string;
}

export function fetchMetrics(limit = 100, query: MetricQuery = {}): Promise<Metric[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.service) params.set("service", query.service);
  if (query.dataType) params.set("data_type", query.dataType);
  return fetchJSON<Metric[]>(`/api/metrics?${params}`);
}

// Logs
export interface LogQuery {
  service?: string;
  severity?: string;
}

export function fetchLogs(limit = 100, query: LogQuery = {}): Promise<LogRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.service) params.set("service", query.service);
  if (query.severity) params.set("severity", query.severity);
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
