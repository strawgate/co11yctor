//go:build nobpf

package tests

import (
"testing"
"time"

"github.com/strawgate/co11yctor/internal/otlp"
)

func TestParseSimulatedJSON(t *testing.T) {
parser := otlp.NewParser()
payload := []byte(`{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"test-svc"}}]},"scopeSpans":[{"spans":[{"traceId":"abc123","spanId":"def456","name":"test-op","startTimeUnixNano":1000000,"endTimeUnixNano":2000000,"status":{"code":1}}]}]}]}`)

result := parser.Parse(payload, "10.0.0.1", "http", time.Now())
if result == nil {
t.Fatal("expected non-nil result")
}
if len(result.Spans) != 1 {
t.Fatalf("expected 1 span, got %d", len(result.Spans))
}
span := result.Spans[0]
if span.ServiceName != "test-svc" {
t.Errorf("expected service name test-svc, got %s", span.ServiceName)
}
if span.Name != "test-op" {
t.Errorf("expected span name test-op, got %s", span.Name)
}
}

func TestParseEmpty(t *testing.T) {
parser := otlp.NewParser()
result := parser.Parse(nil, "10.0.0.1", "http", time.Now())
if result != nil {
t.Error("expected nil result for empty payload")
}
}

func TestParseInvalidJSON(t *testing.T) {
parser := otlp.NewParser()
result := parser.Parse([]byte("not json"), "10.0.0.1", "http", time.Now())
if result != nil && len(result.Spans)+len(result.Metrics)+len(result.Logs) > 0 {
t.Error("expected no data from invalid JSON")
}
}
