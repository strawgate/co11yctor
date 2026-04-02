// API types matching Go backend structs

export interface Span {
  TraceID: string;
  SpanID: string;
  ParentSpanID: string;
  Name: string;
  ServiceName: string;
  StartTimeUnixNano: number;
  EndTimeUnixNano: number;
  StatusCode: number;
  StatusMessage: string;
  Attributes: Record<string, string>;
  CapturedAt: string;
  SourceIP: string;
  Proto: string;
}

export interface Metric {
  Name: string;
  Description: string;
  Unit: string;
  ServiceName: string;
  DataType: string;
  Value: number;
  Timestamp: number;
  Attributes: Record<string, string>;
  CapturedAt: string;
  SourceIP: string;
  Proto: string;
}

export interface LogRecord {
  TraceID: string;
  SpanID: string;
  SeverityText: string;
  SeverityNumber: number;
  Body: string;
  ServiceName: string;
  TimeUnixNano: number;
  Attributes: Record<string, string>;
  CapturedAt: string;
  SourceIP: string;
  Proto: string;
}

export interface Stats {
  TotalSpans: number;
  TotalMetrics: number;
  TotalLogs: number;
  OldestRecord: string;
  NewestRecord: string;
}

export interface ServiceInfo {
  name: string;
  spanCount: number;
  metricCount: number;
  logCount: number;
  lastSeen: string;
}

export type TelemetryEvent = (Span | Metric | LogRecord) & { _type: string };
