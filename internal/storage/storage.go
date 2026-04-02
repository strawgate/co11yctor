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
	StreamChan() <-chan interface{}
	Close() error
}
