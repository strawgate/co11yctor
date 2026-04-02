//go:build nobpf

package tests

import (
"context"
"os"
"testing"
"time"

"github.com/strawgate/co11yctor/internal/otlp"
"github.com/strawgate/co11yctor/internal/storage"
)

func TestDuckDBInsertAndQuery(t *testing.T) {
dbPath := "test_co11yctor.db"
defer os.Remove(dbPath)

store, err := storage.NewDuckDB(dbPath)
if err != nil {
t.Fatalf("NewDuckDB: %v", err)
}
defer store.Close()

ctx := context.Background()

span := otlp.Span{
TraceID:           "trace-1",
SpanID:            "span-1",
Name:              "test-operation",
ServiceName:       "test-service",
StartTimeUnixNano: 1000000,
EndTimeUnixNano:   2000000,
StatusCode:        1,
Attributes:        map[string]string{"key": "value"},
CapturedAt:        time.Now(),
SourceIP:          "10.0.0.1",
Proto:             "http",
}

if err := store.InsertSpan(ctx, span); err != nil {
t.Fatalf("InsertSpan: %v", err)
}

spans, err := store.GetRecentSpans(ctx, 10)
if err != nil {
t.Fatalf("GetRecentSpans: %v", err)
}
if len(spans) != 1 {
t.Fatalf("expected 1 span, got %d", len(spans))
}
if spans[0].Name != "test-operation" {
t.Errorf("expected test-operation, got %s", spans[0].Name)
}

metric := otlp.Metric{
Name:        "test.metric",
ServiceName: "test-service",
DataType:    "gauge",
Value:       42.0,
CapturedAt:  time.Now(),
Attributes:  map[string]string{},
}
if err := store.InsertMetric(ctx, metric); err != nil {
t.Fatalf("InsertMetric: %v", err)
}

logRec := otlp.LogRecord{
Body:         "test log message",
ServiceName:  "test-service",
SeverityText: "INFO",
CapturedAt:   time.Now(),
Attributes:   map[string]string{},
}
if err := store.InsertLog(ctx, logRec); err != nil {
t.Fatalf("InsertLog: %v", err)
}

stats, err := store.GetStats(ctx)
if err != nil {
t.Fatalf("GetStats: %v", err)
}
if stats.TotalSpans != 1 {
t.Errorf("expected 1 span in stats, got %d", stats.TotalSpans)
}
if stats.TotalMetrics != 1 {
t.Errorf("expected 1 metric in stats, got %d", stats.TotalMetrics)
}
if stats.TotalLogs != 1 {
t.Errorf("expected 1 log in stats, got %d", stats.TotalLogs)
}
}
