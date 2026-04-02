package api

import (
"encoding/json"
"io/fs"
"log"
"net/http"
"strconv"
)

func (s *Server) registerRoutes(mux *http.ServeMux) {
subFS, err := fs.Sub(staticFiles, "static")
if err != nil {
log.Fatalf("static files: %v", err)
}
mux.Handle("/", http.FileServer(http.FS(subFS)))

mux.HandleFunc("/api/spans", s.handleSpans)
mux.HandleFunc("/api/metrics", s.handleMetrics)
mux.HandleFunc("/api/logs", s.handleLogs)
mux.HandleFunc("/api/stats", s.handleStats)
mux.HandleFunc("/ws", s.handleWebSocket)
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

func (s *Server) handleSpans(w http.ResponseWriter, r *http.Request) {
spans, err := s.store.GetRecentSpans(r.Context(), limit(r, 100))
if err != nil {
http.Error(w, err.Error(), http.StatusInternalServerError)
return
}
writeJSON(w, spans)
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
metrics, err := s.store.GetRecentMetrics(r.Context(), limit(r, 100))
if err != nil {
http.Error(w, err.Error(), http.StatusInternalServerError)
return
}
writeJSON(w, metrics)
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
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
