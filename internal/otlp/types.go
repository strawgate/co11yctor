package otlp

import "time"

// TelemetryType identifies the kind of OTLP telemetry.
type TelemetryType int

const (
	TelemetrySpan   TelemetryType = iota
	TelemetryMetric TelemetryType = iota
	TelemetryLog    TelemetryType = iota
)

// Span represents a single distributed trace span.
type Span struct {
	TraceID           string
	SpanID            string
	ParentSpanID      string
	Name              string
	ServiceName       string
	StartTimeUnixNano uint64
	EndTimeUnixNano   uint64
	StatusCode        int32
	StatusMessage     string
	Attributes        map[string]string
	CapturedAt        time.Time
	SourceIP          string
	Proto             string
}

// Metric represents a single metric data point.
type Metric struct {
	Name        string
	Description string
	Unit        string
	ServiceName string
	DataType    string
	Value       float64
	Timestamp   uint64
	Attributes  map[string]string
	CapturedAt  time.Time
	SourceIP    string
	Proto       string
}

// LogRecord represents a single log entry.
type LogRecord struct {
	TraceID        string
	SpanID         string
	SeverityText   string
	SeverityNumber int32
	Body           string
	ServiceName    string
	TimeUnixNano   uint64
	Attributes     map[string]string
	CapturedAt     time.Time
	SourceIP       string
	Proto          string
}

// ParseResult holds the results of parsing a packet payload.
type ParseResult struct {
	Spans   []Span
	Metrics []Metric
	Logs    []LogRecord
}
