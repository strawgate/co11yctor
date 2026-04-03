package storage

import (
	"context"
	"time"

	"github.com/strawgate/co11yctor/internal/otlp"
)

// Stats holds aggregate statistics about stored telemetry.
type Stats struct {
	TotalSpans   int64
	TotalMetrics int64
	TotalLogs    int64
	OldestRecord time.Time
	NewestRecord time.Time
}

// ServiceEdge represents a dependency between two services.
type ServiceEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Count  int    `json:"count"`
}

// DataSource summarizes telemetry received from a source/service pair.
type DataSource struct {
	SourceIP    string    `json:"sourceIp"`
	ServiceName string    `json:"serviceName"`
	SpanCount   int64     `json:"spanCount"`
	MetricCount int64     `json:"metricCount"`
	LogCount    int64     `json:"logCount"`
	LastSeen    time.Time `json:"lastSeen"`
}

// Storage defines the interface for telemetry persistence.
type Storage interface {
	InsertSpan(ctx context.Context, span otlp.Span) error
	InsertMetric(ctx context.Context, metric otlp.Metric) error
	InsertLog(ctx context.Context, logRecord otlp.LogRecord) error

	QuerySpans(ctx context.Context, query string, limit int) ([]otlp.Span, error)
	QueryMetrics(ctx context.Context, query string, limit int) ([]otlp.Metric, error)
	QueryLogs(ctx context.Context, query string, limit int) ([]otlp.LogRecord, error)

	GetRecentSpans(ctx context.Context, limit int) ([]otlp.Span, error)
	GetRecentMetrics(ctx context.Context, limit int) ([]otlp.Metric, error)
	GetRecentLogs(ctx context.Context, limit int) ([]otlp.LogRecord, error)

	GetStats(ctx context.Context) (*Stats, error)
	GetServices(ctx context.Context) ([]string, error)
	GetServiceEdges(ctx context.Context) ([]ServiceEdge, error)
	GetDataSources(ctx context.Context) ([]DataSource, error)
	StreamChan() <-chan interface{}
	Close() error
}
