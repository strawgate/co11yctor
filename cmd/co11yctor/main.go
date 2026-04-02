package main

import (
"context"
"flag"
"log"
"os"
"os/signal"
"syscall"

"github.com/strawgate/co11yctor/internal/api"
"github.com/strawgate/co11yctor/internal/capture"
"github.com/strawgate/co11yctor/internal/otlp"
"github.com/strawgate/co11yctor/internal/storage"
)

func main() {
iface := flag.String("interface", "eth0", "Network interface to capture on")
flag.StringVar(iface, "i", "eth0", "Network interface (shorthand)")
dbPath := flag.String("db", "co11yctor.db", "DuckDB file path")
port := flag.Int("port", 8080, "HTTP port for web UI")
flag.IntVar(port, "p", 8080, "HTTP port (shorthand)")
verbose := flag.Bool("verbose", false, "Verbose logging")
flag.BoolVar(verbose, "v", false, "Verbose logging (shorthand)")
noEBPF := flag.Bool("no-ebpf", false, "Run without eBPF (simulated data)")
flag.Parse()

ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

store, err := storage.NewDuckDB(*dbPath)
if err != nil {
log.Fatalf("Failed to open storage: %v", err)
}
defer store.Close()

mgr := capture.New(*iface, !*noEBPF, *verbose)
if err := mgr.Start(ctx); err != nil {
log.Fatalf("Failed to start capture: %v", err)
}

parser := otlp.NewParser()
go func() {
for {
select {
case <-ctx.Done():
return
case pkt, ok := <-mgr.Events():
if !ok {
return
}
if *verbose {
log.Printf("Captured packet: %s:%d -> %s:%d proto=%s dir=%s len=%d",
pkt.SrcIP, pkt.SrcPort, pkt.DstIP, pkt.DstPort,
pkt.Proto, pkt.Direction, len(pkt.Payload))
}
result := parser.Parse(pkt.Payload, pkt.SrcIP, pkt.Proto, pkt.CapturedAt)
if result == nil {
continue
}
for _, span := range result.Spans {
if err := store.InsertSpan(ctx, span); err != nil && *verbose {
log.Printf("InsertSpan: %v", err)
}
}
for _, metric := range result.Metrics {
if err := store.InsertMetric(ctx, metric); err != nil && *verbose {
log.Printf("InsertMetric: %v", err)
}
}
for _, logRec := range result.Logs {
if err := store.InsertLog(ctx, logRec); err != nil && *verbose {
log.Printf("InsertLog: %v", err)
}
}
}
}
}()

srv := api.New(store, *port)
if err := srv.Start(ctx); err != nil {
log.Printf("Server stopped: %v", err)
}
}
