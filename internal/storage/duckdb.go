package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/marcboeker/go-duckdb"
	"github.com/strawgate/co11yctor/internal/otlp"
)

// DuckDB implements Storage using DuckDB.
type DuckDB struct {
	db     *sql.DB
	stream chan interface{}
}

// NewDuckDB opens (or creates) a DuckDB database at the given path.
func NewDuckDB(path string) (*DuckDB, error) {
	db, err := sql.Open("duckdb", path)
	if err != nil {
		return nil, fmt.Errorf("open duckdb: %w", err)
	}

	d := &DuckDB{db: db, stream: make(chan interface{}, 1000)}
	if err := d.createSchema(); err != nil {
		db.Close()
		return nil, err
	}
	return d, nil
}

func (d *DuckDB) createSchema() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS spans (
			id          VARCHAR PRIMARY KEY,
			trace_id    VARCHAR,
			span_id     VARCHAR,
			parent_span_id VARCHAR,
			name        VARCHAR,
			service_name VARCHAR,
			start_time_unix_nano UBIGINT,
			end_time_unix_nano   UBIGINT,
			status_code INTEGER,
			status_message VARCHAR,
			attributes  VARCHAR,
			captured_at TIMESTAMP,
			source_ip   VARCHAR,
			proto       VARCHAR
		)`,
		`CREATE TABLE IF NOT EXISTS metrics (
			id          VARCHAR PRIMARY KEY,
			name        VARCHAR,
			description VARCHAR,
			unit        VARCHAR,
			service_name VARCHAR,
			data_type   VARCHAR,
			value       DOUBLE,
			timestamp_unix_nano UBIGINT,
			attributes  VARCHAR,
			captured_at TIMESTAMP,
			source_ip   VARCHAR,
			proto       VARCHAR
		)`,
		`CREATE TABLE IF NOT EXISTS logs (
			id          VARCHAR PRIMARY KEY,
			trace_id    VARCHAR,
			span_id     VARCHAR,
			severity_text   VARCHAR,
			severity_number INTEGER,
			body        VARCHAR,
			service_name VARCHAR,
			time_unix_nano  UBIGINT,
			attributes  VARCHAR,
			captured_at TIMESTAMP,
			source_ip   VARCHAR,
			proto       VARCHAR
		)`,
	}
	for _, s := range stmts {
		if _, err := d.db.Exec(s); err != nil {
			return fmt.Errorf("create schema: %w", err)
		}
	}
	return nil
}

func marshalAttrs(attrs map[string]string) string {
	if len(attrs) == 0 {
		return "{}"
	}
	b, _ := json.Marshal(attrs)
	return string(b)
}

func (d *DuckDB) InsertSpan(ctx context.Context, span otlp.Span) error {
	id := fmt.Sprintf("%s-%s-%d", span.TraceID, span.SpanID, span.CapturedAt.UnixNano())
	_, err := d.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO spans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, span.TraceID, span.SpanID, span.ParentSpanID, span.Name,
		span.ServiceName, span.StartTimeUnixNano, span.EndTimeUnixNano,
		span.StatusCode, span.StatusMessage, marshalAttrs(span.Attributes),
		span.CapturedAt, span.SourceIP, span.Proto,
	)
	if err != nil {
		return err
	}
	select {
	case d.stream <- span:
	default:
	}
	return nil
}

func (d *DuckDB) InsertMetric(ctx context.Context, metric otlp.Metric) error {
	id := fmt.Sprintf("%s-%s-%d", metric.ServiceName, metric.Name, metric.CapturedAt.UnixNano())
	_, err := d.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO metrics VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, metric.Name, metric.Description, metric.Unit, metric.ServiceName,
		metric.DataType, metric.Value, metric.Timestamp,
		marshalAttrs(metric.Attributes), metric.CapturedAt, metric.SourceIP, metric.Proto,
	)
	if err != nil {
		return err
	}
	select {
	case d.stream <- metric:
	default:
	}
	return nil
}

func (d *DuckDB) InsertLog(ctx context.Context, logRecord otlp.LogRecord) error {
	id := fmt.Sprintf("%s-%s-%d", logRecord.TraceID, logRecord.SpanID, logRecord.CapturedAt.UnixNano())
	_, err := d.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, logRecord.TraceID, logRecord.SpanID, logRecord.SeverityText,
		logRecord.SeverityNumber, logRecord.Body, logRecord.ServiceName,
		logRecord.TimeUnixNano, marshalAttrs(logRecord.Attributes),
		logRecord.CapturedAt, logRecord.SourceIP, logRecord.Proto,
	)
	if err != nil {
		return err
	}
	select {
	case d.stream <- logRecord:
	default:
	}
	return nil
}

func (d *DuckDB) GetRecentSpans(ctx context.Context, limit int) ([]otlp.Span, error) {
	return d.QuerySpans(ctx, "", limit)
}

func (d *DuckDB) GetRecentMetrics(ctx context.Context, limit int) ([]otlp.Metric, error) {
	return d.QueryMetrics(ctx, "", limit)
}

func (d *DuckDB) GetRecentLogs(ctx context.Context, limit int) ([]otlp.LogRecord, error) {
	return d.QueryLogs(ctx, "", limit)
}

func (d *DuckDB) QuerySpans(ctx context.Context, filter string, limit int) ([]otlp.Span, error) {
	q := `SELECT trace_id, span_id, parent_span_id, name, service_name,
		         start_time_unix_nano, end_time_unix_nano, status_code, status_message,
		         attributes, captured_at, source_ip, proto
		  FROM spans`
	if filter != "" {
		q += " WHERE " + filter
	}
	q += fmt.Sprintf(" ORDER BY captured_at DESC LIMIT %d", limit)

	rows, err := d.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var spans []otlp.Span
	for rows.Next() {
		var s otlp.Span
		var attrsJSON string
		var capturedAt time.Time
		if err := rows.Scan(&s.TraceID, &s.SpanID, &s.ParentSpanID, &s.Name,
			&s.ServiceName, &s.StartTimeUnixNano, &s.EndTimeUnixNano,
			&s.StatusCode, &s.StatusMessage, &attrsJSON, &capturedAt,
			&s.SourceIP, &s.Proto); err != nil {
			return nil, err
		}
		s.CapturedAt = capturedAt
		_ = json.Unmarshal([]byte(attrsJSON), &s.Attributes)
		spans = append(spans, s)
	}
	return spans, rows.Err()
}

func (d *DuckDB) QueryMetrics(ctx context.Context, filter string, limit int) ([]otlp.Metric, error) {
	q := `SELECT name, description, unit, service_name, data_type, value,
		         timestamp_unix_nano, attributes, captured_at, source_ip, proto
		  FROM metrics`
	if filter != "" {
		q += " WHERE " + filter
	}
	q += fmt.Sprintf(" ORDER BY captured_at DESC LIMIT %d", limit)

	rows, err := d.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []otlp.Metric
	for rows.Next() {
		var m otlp.Metric
		var attrsJSON string
		var capturedAt time.Time
		if err := rows.Scan(&m.Name, &m.Description, &m.Unit, &m.ServiceName,
			&m.DataType, &m.Value, &m.Timestamp, &attrsJSON, &capturedAt,
			&m.SourceIP, &m.Proto); err != nil {
			return nil, err
		}
		m.CapturedAt = capturedAt
		_ = json.Unmarshal([]byte(attrsJSON), &m.Attributes)
		metrics = append(metrics, m)
	}
	return metrics, rows.Err()
}

func (d *DuckDB) QueryLogs(ctx context.Context, filter string, limit int) ([]otlp.LogRecord, error) {
	q := `SELECT trace_id, span_id, severity_text, severity_number, body,
		         service_name, time_unix_nano, attributes, captured_at, source_ip, proto
		  FROM logs`
	if filter != "" {
		q += " WHERE " + filter
	}
	q += fmt.Sprintf(" ORDER BY captured_at DESC LIMIT %d", limit)

	rows, err := d.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []otlp.LogRecord
	for rows.Next() {
		var l otlp.LogRecord
		var attrsJSON string
		var capturedAt time.Time
		if err := rows.Scan(&l.TraceID, &l.SpanID, &l.SeverityText, &l.SeverityNumber,
			&l.Body, &l.ServiceName, &l.TimeUnixNano, &attrsJSON, &capturedAt,
			&l.SourceIP, &l.Proto); err != nil {
			return nil, err
		}
		l.CapturedAt = capturedAt
		_ = json.Unmarshal([]byte(attrsJSON), &l.Attributes)
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

func (d *DuckDB) GetStats(ctx context.Context) (*Stats, error) {
	stats := &Stats{}

	row := d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM spans`)
	_ = row.Scan(&stats.TotalSpans)

	row = d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM metrics`)
	_ = row.Scan(&stats.TotalMetrics)

	row = d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM logs`)
	_ = row.Scan(&stats.TotalLogs)

	return stats, nil
}

func (d *DuckDB) StreamChan() <-chan interface{} {
	return d.stream
}

func (d *DuckDB) Close() error {
	return d.db.Close()
}
