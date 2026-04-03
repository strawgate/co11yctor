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

const (
	http2FrameHeaderLen = 9
	http2FrameData      = 0 // DATA frame type
	grpcFrameHeaderLen  = 5
)

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

	if bytes.HasPrefix(payload, http2Preface) || isHTTP2Frame(payload) || isGRPCFrame(payload) {
		if r := p.parseGRPC(payload, srcIP, protoType, capturedAt); r != nil {
			mergeResults(result, r)
		}
		if len(result.Spans)+len(result.Metrics)+len(result.Logs) > 0 {
			return result
		}
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
	if len(payload) < grpcFrameHeaderLen {
		return false
	}
	if payload[0] > 1 {
		return false
	}
	msgLen := uint32(payload[1])<<24 | uint32(payload[2])<<16 | uint32(payload[3])<<8 | uint32(payload[4])
	return msgLen > 0 && int(msgLen) <= len(payload)-grpcFrameHeaderLen+1024
}

// isHTTP2Frame detects HTTP/2 frames by their 9-byte header structure.
func isHTTP2Frame(payload []byte) bool {
	if len(payload) < http2FrameHeaderLen {
		return false
	}
	frameType := payload[3]
	if frameType > 9 { // HTTP/2 defines frame types 0-9
		return false
	}
	frameLen := uint32(payload[0])<<16 | uint32(payload[1])<<8 | uint32(payload[2])
	if frameLen > 16*1024*1024 { // Max HTTP/2 frame is 16MB
		return false
	}
	// Stream ID high bit must be 0 (reserved)
	if payload[5]&0x80 != 0 {
		return false
	}
	return true
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

	// Try parsing as HTTP/2 frames (which contain gRPC messages in DATA frames)
	if isHTTP2Frame(data) {
		p.parseHTTP2Frames(data, result, srcIP, protoType, capturedAt)
		if len(result.Spans)+len(result.Metrics)+len(result.Logs) > 0 {
			return result
		}
	}

	// Fallback: try as raw gRPC 5-byte length-prefixed messages
	for len(data) >= grpcFrameHeaderLen {
		if data[0] > 1 {
			break
		}
		msgLen := uint32(data[1])<<24 | uint32(data[2])<<16 | uint32(data[3])<<8 | uint32(data[4])
		data = data[grpcFrameHeaderLen:]
		if msgLen == 0 || int(msgLen) > len(data) {
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

// parseHTTP2Frames extracts gRPC protobuf messages from HTTP/2 DATA frames.
func (p *Parser) parseHTTP2Frames(data []byte, result *ParseResult, srcIP, protoType string, capturedAt time.Time) {
	for len(data) >= http2FrameHeaderLen {
		frameLen := uint32(data[0])<<16 | uint32(data[1])<<8 | uint32(data[2])
		frameType := data[3]
		data = data[http2FrameHeaderLen:]

		if int(frameLen) > len(data) {
			// Partial frame from TCP fragmentation — try to parse what we have
			if frameType == http2FrameData && len(data) > 0 {
				p.extractGRPCFromData(data, result, srcIP, protoType, capturedAt)
			}
			break
		}

		framePayload := data[:frameLen]
		data = data[frameLen:]

		if frameType == http2FrameData && len(framePayload) > 0 {
			p.extractGRPCFromData(framePayload, result, srcIP, protoType, capturedAt)
		}
	}
}

// extractGRPCFromData parses gRPC 5-byte framed messages from an HTTP/2 DATA payload.
func (p *Parser) extractGRPCFromData(data []byte, result *ParseResult, srcIP, protoType string, capturedAt time.Time) {
	for len(data) >= grpcFrameHeaderLen {
		if data[0] > 1 { // Compression flag must be 0 or 1
			break
		}
		msgLen := uint32(data[1])<<24 | uint32(data[2])<<16 | uint32(data[3])<<8 | uint32(data[4])
		data = data[grpcFrameHeaderLen:]
		if msgLen == 0 || int(msgLen) > len(data) {
			// Partial message — try parsing what we have if there's enough data
			if msgLen > 0 && len(data) > 0 {
				if r := p.parseProtobuf(data, srcIP, protoType, capturedAt); r != nil {
					mergeResults(result, r)
				}
			}
			break
		}
		msg := data[:msgLen]
		data = data[msgLen:]
		if r := p.parseProtobuf(msg, srcIP, protoType, capturedAt); r != nil {
			mergeResults(result, r)
		}
	}
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
