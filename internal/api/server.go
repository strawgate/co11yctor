package api

import (
"context"
"embed"
"fmt"
"log"
"net/http"
"time"

"github.com/gorilla/websocket"
"github.com/strawgate/co11yctor/internal/storage"
)

//go:embed static
var staticFiles embed.FS

// Server is the HTTP API and web UI server.
type Server struct {
store    storage.Storage
port     int
upgrader websocket.Upgrader
hub      *wsHub
}

// wsHub manages WebSocket connections.
type wsHub struct {
clients    map[*websocket.Conn]bool
broadcast  chan []byte
register   chan *websocket.Conn
unregister chan *websocket.Conn
}

func newHub() *wsHub {
return &wsHub{
clients:    make(map[*websocket.Conn]bool),
broadcast:  make(chan []byte, 256),
register:   make(chan *websocket.Conn),
unregister: make(chan *websocket.Conn),
}
}

func (h *wsHub) run(ctx context.Context) {
for {
select {
case <-ctx.Done():
return
case conn := <-h.register:
h.clients[conn] = true
case conn := <-h.unregister:
if _, ok := h.clients[conn]; ok {
delete(h.clients, conn)
conn.Close()
}
case msg := <-h.broadcast:
for conn := range h.clients {
if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
delete(h.clients, conn)
conn.Close()
}
}
}
}
}

// New creates a new API Server.
func New(store storage.Storage, port int) *Server {
s := &Server{
store: store,
port:  port,
upgrader: websocket.Upgrader{
CheckOrigin: func(r *http.Request) bool { return true },
},
hub: newHub(),
}
return s
}

// Start starts the HTTP server.
func (s *Server) Start(ctx context.Context) error {
go s.hub.run(ctx)
go s.streamToWebSocket(ctx)

mux := http.NewServeMux()
s.registerRoutes(mux)

srv := &http.Server{
Addr:         fmt.Sprintf(":%d", s.port),
Handler:      mux,
ReadTimeout:  30 * time.Second,
WriteTimeout: 30 * time.Second,
}

go func() {
<-ctx.Done()
shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
_ = srv.Shutdown(shutdownCtx)
}()

log.Printf("Web UI available at http://localhost:%d", s.port)
if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
return err
}
return nil
}

func (s *Server) streamToWebSocket(ctx context.Context) {
stream := s.store.StreamChan()
for {
select {
case <-ctx.Done():
return
case event, ok := <-stream:
if !ok {
return
}
msg := marshalEvent(event)
if msg != nil {
select {
case s.hub.broadcast <- msg:
default:
}
}
}
}
}
