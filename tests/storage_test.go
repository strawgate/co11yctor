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

	services, err := store.GetServices(ctx)
	if err != nil {
		t.Fatalf("GetServices: %v", err)
	}
	if len(services) != 1 || services[0] != "test-service" {
		t.Fatalf("unexpected services: %#v", services)
	}
}

func TestDuckDBGetServiceEdges(t *testing.T) {
	dbPath := "test_edges_co11yctor.db"
	defer os.Remove(dbPath)

	store, err := storage.NewDuckDB(dbPath)
	if err != nil {
		t.Fatalf("NewDuckDB: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	now := time.Now()

	parent := otlp.Span{
		TraceID:           "trace-edges",
		SpanID:            "parent-span",
		Name:              "gateway",
		ServiceName:       "frontend",
		StartTimeUnixNano: 1_000_000,
		EndTimeUnixNano:   3_000_000,
		StatusCode:        1,
		Attributes:        map[string]string{},
		CapturedAt:        now,
		SourceIP:          "10.0.0.1",
		Proto:             "grpc",
	}
	child := otlp.Span{
		TraceID:           "trace-edges",
		SpanID:            "child-span",
		ParentSpanID:      "parent-span",
		Name:              "db-call",
		ServiceName:       "database",
		StartTimeUnixNano: 1_500_000,
		EndTimeUnixNano:   2_500_000,
		StatusCode:        1,
		Attributes:        map[string]string{},
		CapturedAt:        now.Add(time.Millisecond),
		SourceIP:          "10.0.0.2",
		Proto:             "grpc",
	}

	if err := store.InsertSpan(ctx, parent); err != nil {
		t.Fatalf("InsertSpan parent: %v", err)
	}
	if err := store.InsertSpan(ctx, child); err != nil {
		t.Fatalf("InsertSpan child: %v", err)
	}

	edges, err := store.GetServiceEdges(ctx)
	if err != nil {
		t.Fatalf("GetServiceEdges: %v", err)
	}
	if len(edges) != 1 {
		t.Fatalf("expected 1 edge, got %d", len(edges))
	}
	if edges[0].Source != "frontend" || edges[0].Target != "database" || edges[0].Count != 1 {
		t.Fatalf("unexpected edge: %#v", edges[0])
	}
}

func TestDuckDBGetDataSources(t *testing.T) {
	dbPath := "test_sources_co11yctor.db"
	defer os.Remove(dbPath)

	store, err := storage.NewDuckDB(dbPath)
	if err != nil {
		t.Fatalf("NewDuckDB: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	now := time.Now()

	if err := store.InsertSpan(ctx, otlp.Span{
		TraceID:           "trace-source",
		SpanID:            "span-source",
		Name:              "request",
		ServiceName:       "checkout",
		StartTimeUnixNano: 100,
		EndTimeUnixNano:   200,
		StatusCode:        1,
		CapturedAt:        now,
		SourceIP:          "10.1.0.4",
		Proto:             "grpc",
		Attributes:        map[string]string{},
	}); err != nil {
		t.Fatalf("InsertSpan: %v", err)
	}

	if err := store.InsertMetric(ctx, otlp.Metric{
		Name:        "http.server.duration",
		ServiceName: "checkout",
		DataType:    "histogram",
		Value:       42,
		CapturedAt:  now.Add(time.Second),
		SourceIP:    "10.1.0.4",
		Proto:       "grpc",
		Attributes:  map[string]string{},
	}); err != nil {
		t.Fatalf("InsertMetric: %v", err)
	}

	if err := store.InsertLog(ctx, otlp.LogRecord{
		Body:         "order received",
		ServiceName:  "payments",
		SeverityText: "INFO",
		CapturedAt:   now.Add(2 * time.Second),
		SourceIP:     "10.1.0.9",
		Proto:        "http",
		Attributes:   map[string]string{},
	}); err != nil {
		t.Fatalf("InsertLog: %v", err)
	}

	sources, err := store.GetDataSources(ctx)
	if err != nil {
		t.Fatalf("GetDataSources: %v", err)
	}
	if len(sources) != 2 {
		t.Fatalf("expected 2 sources, got %d", len(sources))
	}

	if sources[0].SourceIP != "10.1.0.4" || sources[0].ServiceName != "checkout" {
		t.Fatalf("unexpected first source: %#v", sources[0])
	}
	if sources[0].SpanCount != 1 || sources[0].MetricCount != 1 || sources[0].LogCount != 0 {
		t.Fatalf("unexpected first source counts: %#v", sources[0])
	}

	if sources[1].SourceIP != "10.1.0.9" || sources[1].ServiceName != "payments" {
		t.Fatalf("unexpected second source: %#v", sources[1])
	}
	if sources[1].SpanCount != 0 || sources[1].MetricCount != 0 || sources[1].LogCount != 1 {
		t.Fatalf("unexpected second source counts: %#v", sources[1])
	}
}
