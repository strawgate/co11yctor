package otlp

import (
	"bytes"
	"encoding/json"
	"log"
	"strings"
	"time"

	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortrace "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
	protobuf "google.golang.org/protobuf/proto"
)

var http2Preface = []byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")

// Parser parses OTLP payloads.
type Parser struct{}

// NewParser creates a new Parser.
func NewParser() *Parser { return &Parser{} }

// Parse attempts to parse OTLP data from a raw payload.
func (p *Parser) Parse(payload []byte, srcIP, protoType string, capturedAt time.Time) *ParseResult {
	if len(payload) == 0 {
		return nil
	}
	result := &ParseResult{}

	if bytes.HasPrefix(payload, http2Preface) || isGRPCFrame(payload) {
		if r := p.parseGRPC(payload, srcIP, protoType, capturedAt); r != nil {
			mergeResults(result, r)
		}
		return result
	}

	if isHTTP1(payload) {
		body := extractHTTPBody(payload)
		if body != nil {
			ct := extractContentType(payload)
			if strings.Contains(ct, "application/x-protobuf") || strings.Contains(ct, "application/grpc") {
				if r := p.parseProtobuf(body, srcIP, protoType, capturedAt); r != nil {
					mergeResults(result, r)
				}
			} else {
				if r := p.parseJSON(body, srcIP, protoType, capturedAt); r != nil {
					mergeResults(result, r)
				}
			}
		}
		return result
	}

	if r := p.parseProtobuf(payload, srcIP, protoType, capturedAt); r != nil && len(r.Spans)+len(r.Metrics)+len(r.Logs) > 0 {
		mergeResults(result, r)
		return result
	}

	if r := p.parseJSON(payload, srcIP, protoType, capturedAt); r != nil {
		mergeResults(result, r)
	}
	return result
}

func isGRPCFrame(payload []byte) bool {
	if len(payload) < 5 {
		return false
	}
	if payload[0] > 1 {
		return false
	}
	msgLen := uint32(payload[1])<<24 | uint32(payload[2])<<16 | uint32(payload[3])<<8 | uint32(payload[4])
	return msgLen > 0 && int(msgLen) < len(payload)+1024
}

func isHTTP1(payload []byte) bool {
	return bytes.HasPrefix(payload, []byte("POST ")) ||
		bytes.HasPrefix(payload, []byte("GET ")) ||
		bytes.HasPrefix(payload, []byte("HTTP/1"))
}

func extractContentType(payload []byte) string {
	lines := bytes.Split(payload, []byte("\r\n"))
	for _, line := range lines {
		lower := bytes.ToLower(line)
		if bytes.HasPrefix(lower, []byte("content-type:")) {
			return string(bytes.TrimSpace(line[len("content-type:"):]))
		}
	}
	return ""
}

func extractHTTPBody(payload []byte) []byte {
	idx := bytes.Index(payload, []byte("\r\n\r\n"))
	if idx < 0 {
		return nil
	}
	return payload[idx+4:]
}

func (p *Parser) parseGRPC(payload []byte, srcIP, protoType string, capturedAt time.Time) *ParseResult {
	data := payload
	if bytes.HasPrefix(data, http2Preface) {
		data = data[len(http2Preface):]
	}
	result := &ParseResult{}
	for len(data) >= 5 {
		msgLen := uint32(data[1])<<24 | uint32(data[2])<<16 | uint32(data[3])<<8 | uint32(data[4])
		data = data[5:]
		if int(msgLen) > len(data) {
			break
		}
		msg := data[:msgLen]
		data = data[msgLen:]
		if r := p.parseProtobuf(msg, srcIP, protoType, capturedAt); r != nil {
			mergeResults(result, r)
		}
	}
	return result
}

func (p *Parser) parseProtobuf(payload []byte, srcIP, protoType string, capturedAt time.Time) *ParseResult {
	result := &ParseResult{}

	traceReq := &collectortrace.ExportTraceServiceRequest{}
	if err := protobuf.Unmarshal(payload, traceReq); err == nil && len(traceReq.ResourceSpans) > 0 {
		for _, rs := range traceReq.ResourceSpans {
			svcName := extractServiceName(rs.Resource)
			for _, ss := range rs.ScopeSpans {
				for _, sp := range ss.Spans {
					result.Spans = append(result.Spans, Span{
						TraceID:           hexID(sp.TraceId),
						SpanID:            hexID(sp.SpanId),
						ParentSpanID:      hexID(sp.ParentSpanId),
						Name:              sp.Name,
						ServiceName:       svcName,
						StartTimeUnixNano: sp.StartTimeUnixNano,
						EndTimeUnixNano:   sp.EndTimeUnixNano,
						StatusCode:        int32(sp.Status.GetCode()),
						StatusMessage:     sp.Status.GetMessage(),
						Attributes:        attrsToMap(sp.Attributes),
						CapturedAt:        capturedAt,
						SourceIP:          srcIP,
						Proto:             protoType,
					})
				}
			}
		}
		if len(result.Spans) > 0 {
			return result
		}
	}

	metricsReq := &collectormetrics.ExportMetricsServiceRequest{}
	if err := protobuf.Unmarshal(payload, metricsReq); err == nil && len(metricsReq.ResourceMetrics) > 0 {
		for _, rm := range metricsReq.ResourceMetrics {
			svcName := extractServiceName(rm.Resource)
			for _, sm := range rm.ScopeMetrics {
				for _, m := range sm.Metrics {
					metric := Metric{
						Name:        m.Name,
						Description: m.Description,
						Unit:        m.Unit,
						ServiceName: svcName,
						CapturedAt:  capturedAt,
						SourceIP:    srcIP,
						Proto:       protoType,
					}
					switch d := m.Data.(type) {
					case *metricsv1.Metric_Gauge:
						metric.DataType = "gauge"
						if len(d.Gauge.DataPoints) > 0 {
							dp := d.Gauge.DataPoints[0]
							metric.Timestamp = dp.TimeUnixNano
							switch v := dp.Value.(type) {
							case *metricsv1.NumberDataPoint_AsDouble:
								metric.Value = v.AsDouble
							case *metricsv1.NumberDataPoint_AsInt:
								metric.Value = float64(v.AsInt)
							}
							metric.Attributes = attrsToMap(dp.Attributes)
						}
					case *metricsv1.Metric_Sum:
						metric.DataType = "sum"
						if len(d.Sum.DataPoints) > 0 {
							dp := d.Sum.DataPoints[0]
							metric.Timestamp = dp.TimeUnixNano
							switch v := dp.Value.(type) {
							case *metricsv1.NumberDataPoint_AsDouble:
								metric.Value = v.AsDouble
							case *metricsv1.NumberDataPoint_AsInt:
								metric.Value = float64(v.AsInt)
							}
							metric.Attributes = attrsToMap(dp.Attributes)
						}
					}
					result.Metrics = append(result.Metrics, metric)
				}
			}
		}
		if len(result.Metrics) > 0 {
			return result
		}
	}

	logsReq := &collectorlogs.ExportLogsServiceRequest{}
	if err := protobuf.Unmarshal(payload, logsReq); err == nil && len(logsReq.ResourceLogs) > 0 {
		for _, rl := range logsReq.ResourceLogs {
			svcName := extractServiceName(rl.Resource)
			for _, sl := range rl.ScopeLogs {
				for _, lr := range sl.LogRecords {
					body := ""
					if lr.Body != nil {
						body = lr.Body.GetStringValue()
					}
					result.Logs = append(result.Logs, LogRecord{
						TraceID:        hexID(lr.TraceId),
						SpanID:         hexID(lr.SpanId),
						SeverityText:   lr.SeverityText,
						SeverityNumber: int32(lr.SeverityNumber),
						Body:           body,
						ServiceName:    svcName,
						TimeUnixNano:   lr.TimeUnixNano,
						Attributes:     attrsToMap(lr.Attributes),
						CapturedAt:     capturedAt,
						SourceIP:       srcIP,
						Proto:          protoType,
					})
				}
			}
		}
	}

	return result
}

// simSpan matches the JSON structure used in generateSimulatedData.
type simSpan struct {
	TraceID           string `json:"traceId"`
	SpanID            string `json:"spanId"`
	Name              string `json:"name"`
	StartTimeUnixNano int64  `json:"startTimeUnixNano"`
	EndTimeUnixNano   int64  `json:"endTimeUnixNano"`
	Status            struct {
		Code int32 `json:"code"`
	} `json:"status"`
}

type simTraceRequest struct {
	ResourceSpans []struct {
		Resource struct {
			Attributes []struct {
				Key   string `json:"key"`
				Value struct {
					StringValue string `json:"stringValue"`
				} `json:"value"`
			} `json:"attributes"`
		} `json:"resource"`
		ScopeSpans []struct {
			Spans []simSpan `json:"spans"`
		} `json:"scopeSpans"`
	} `json:"resourceSpans"`
}

func (p *Parser) parseJSON(payload []byte, srcIP, protoType string, capturedAt time.Time) *ParseResult {
	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 {
		return nil
	}
	if payload[0] != '{' {
		idx := bytes.IndexByte(payload, '{')
		if idx < 0 {
			return nil
		}
		payload = payload[idx:]
	}

	result := &ParseResult{}
	var req simTraceRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		log.Printf("otlp: JSON parse error: %v", err)
		return nil
	}

	for _, rs := range req.ResourceSpans {
		svcName := ""
		for _, attr := range rs.Resource.Attributes {
			if attr.Key == "service.name" {
				svcName = attr.Value.StringValue
			}
		}
		for _, ss := range rs.ScopeSpans {
			for _, sp := range ss.Spans {
				result.Spans = append(result.Spans, Span{
					TraceID:           sp.TraceID,
					SpanID:            sp.SpanID,
					Name:              sp.Name,
					ServiceName:       svcName,
					StartTimeUnixNano: uint64(sp.StartTimeUnixNano),
					EndTimeUnixNano:   uint64(sp.EndTimeUnixNano),
					StatusCode:        sp.Status.Code,
					CapturedAt:        capturedAt,
					SourceIP:          srcIP,
					Proto:             protoType,
					Attributes:        map[string]string{},
				})
			}
		}
	}
	return result
}

func mergeResults(dst, src *ParseResult) {
	dst.Spans = append(dst.Spans, src.Spans...)
	dst.Metrics = append(dst.Metrics, src.Metrics...)
	dst.Logs = append(dst.Logs, src.Logs...)
}

func extractServiceName(res *resourcev1.Resource) string {
	if res == nil {
		return ""
	}
	for _, attr := range res.Attributes {
		if attr.Key == "service.name" {
			return attr.Value.GetStringValue()
		}
	}
	return ""
}

func attrsToMap(attrs []*commonv1.KeyValue) map[string]string {
	m := make(map[string]string, len(attrs))
	for _, a := range attrs {
		m[a.Key] = a.Value.GetStringValue()
	}
	return m
}

func hexID(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	const hexChars = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hexChars[v>>4]
		out[i*2+1] = hexChars[v&0xf]
	}
	return string(out)
}
