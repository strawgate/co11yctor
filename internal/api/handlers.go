package api

import (
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) registerRoutes(mux *http.ServeMux) {
	subFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("static files: %v", err)
	}

	mux.HandleFunc("/api/spans", s.handleSpans)
	mux.HandleFunc("/api/metrics", s.handleMetrics)
	mux.HandleFunc("/api/logs", s.handleLogs)
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/services", s.handleServices)
	mux.HandleFunc("/api/service-map", s.handleServiceMap)
	mux.HandleFunc("/api/data-sources", s.handleDataSources)
	mux.HandleFunc("/ws", s.handleWebSocket)

	// SPA fallback: serve index.html for non-API, non-asset routes
	fileServer := http.FileServer(http.FS(subFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve static file first
		path := r.URL.Path
		if path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}
		// Check if static file exists
		f, err := subFS.Open(path[1:]) // strip leading /
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback: serve index.html for client-side routes
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}

func limit(r *http.Request, def int) int {
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			return n
		}
	}
	return def
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("api: encode response: %v", err)
	}
}

func sqlEquals(column string, value string) string {
	if value == "" {
		return ""
	}
	escaped := strings.ReplaceAll(value, "'", "''")
	return column + " = '" + escaped + "'"
}

func joinFilters(filters ...string) string {
	var parts []string
	for _, filter := range filters {
		if filter != "" {
			parts = append(parts, filter)
		}
	}
	return strings.Join(parts, " AND ")
}

func (s *Server) handleSpans(w http.ResponseWriter, r *http.Request) {
	filter := joinFilters(
		sqlEquals("trace_id", r.URL.Query().Get("trace_id")),
		sqlEquals("service_name", r.URL.Query().Get("service")),
	)

	if filter != "" {
		spans, err := s.store.QuerySpans(r.Context(), filter, limit(r, 100))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, spans)
		return
	}

	spans, err := s.store.GetRecentSpans(r.Context(), limit(r, 100))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, spans)
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	filter := joinFilters(
		sqlEquals("service_name", r.URL.Query().Get("service")),
		sqlEquals("data_type", r.URL.Query().Get("data_type")),
	)

	if filter != "" {
		metrics, err := s.store.QueryMetrics(r.Context(), filter, limit(r, 100))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, metrics)
		return
	}

	metrics, err := s.store.GetRecentMetrics(r.Context(), limit(r, 100))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, metrics)
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	filter := joinFilters(
		sqlEquals("service_name", r.URL.Query().Get("service")),
		sqlEquals("severity_text", r.URL.Query().Get("severity")),
	)

	if filter != "" {
		logs, err := s.store.QueryLogs(r.Context(), filter, limit(r, 100))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, logs)
		return
	}

	logs, err := s.store.GetRecentLogs(r.Context(), limit(r, 100))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, logs)
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.GetStats(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, stats)
}

func (s *Server) handleServices(w http.ResponseWriter, r *http.Request) {
	services, err := s.store.GetServices(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, services)
}

// ServiceEdge represents a dependency between services.
type ServiceEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Count  int    `json:"count"`
}

func (s *Server) handleServiceMap(w http.ResponseWriter, r *http.Request) {
	edges, err := s.store.GetServiceEdges(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, edges)
}

func (s *Server) handleDataSources(w http.ResponseWriter, r *http.Request) {
	sources, err := s.store.GetDataSources(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, sources)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	s.hub.register <- conn

	ctx := r.Context()
	if spans, err := s.store.GetRecentSpans(ctx, 50); err == nil {
		for _, sp := range spans {
			if msg := marshalEvent(sp); msg != nil {
				_ = conn.WriteMessage(1, msg)
			}
		}
	}

	go func() {
		defer func() { s.hub.unregister <- conn }()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
}

func marshalEvent(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}

	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return nil
	}

	if _, ok := m["TraceID"]; ok {
		if _, ok := m["Body"]; ok {
			m["_type"] = "log"
		} else if _, ok := m["Name"]; ok {
			m["_type"] = "span"
		}
	} else if _, ok := m["Name"]; ok {
		m["_type"] = "metric"
	} else {
		m["_type"] = "event"
	}

	result, _ := json.Marshal(m)
	return result
}
