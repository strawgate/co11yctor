# co11yctor

**co11yctor** is an eBPF-based observability tool that spies on
[OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) network
traffic, captures every OTLP span / metric / log that passes through the wire,
stores the data in an embedded [DuckDB](https://duckdb.org/) database, and
serves a real-time web dashboard so you can see exactly what is flowing through
your telemetry pipelines.

```
       ┌──────────────┐           ┌─────────────────┐
  app  │  OTLP/gRPC   │  network  │  co11yctor      │
 SDK ──►  port 4317   ├───────────► eBPF TC hook    │
       │  OTLP/HTTP   │   copy    │  ring buffer    │
       │  port 4318   │           │  DuckDB store   │
       └──────────────┘           │  Web UI :8080   │
                                  └─────────────────┘
```

---

## Features

| Feature | Details |
|---|---|
| **eBPF capture** | TC ingress + egress hooks on any network interface; zero application changes needed |
| **OTLP support** | Parses OTLP/gRPC (protobuf, port 4317) and OTLP/HTTP (protobuf + JSON, port 4318) |
| **DuckDB storage** | Embedded columnar database — fast analytics with no external dependencies |
| **Live stream** | WebSocket push of every captured telemetry item as it arrives |
| **Web dashboard** | Dark-theme SPA: Live Stream · Spans · Metrics · Logs · Stats |
| **Kubernetes** | DaemonSet manifest with the required `CAP_NET_ADMIN` / privileged settings |
| **Simulation mode** | `--no-ebpf` flag generates synthetic OTLP data so you can demo without root |

---

## Quick start

### No eBPF (simulated data — no root required)

```bash
# Build
CGO_ENABLED=1 go build -tags nobpf -o co11yctor ./cmd/co11yctor

# Run with simulated data
./co11yctor --no-ebpf --port 8080

# Open the dashboard
open http://localhost:8080
```

### Full eBPF mode (Linux, requires root)

```bash
# Prerequisites: clang, llvm, libbpf-dev
make generate          # compiles bpf/otlp_capture.c via bpf2go
make build             # CGO_ENABLED=1 go build ./cmd/co11yctor

sudo ./co11yctor -i eth0 --port 8080
```

---

## CLI flags

| Flag | Default | Description |
|---|---|---|
| `-i`, `--interface` | `eth0` | Network interface to attach eBPF TC hooks to |
| `--db` | `co11yctor.db` | Path to DuckDB database file |
| `-p`, `--port` | `8080` | HTTP port for the web dashboard |
| `-v`, `--verbose` | `false` | Enable verbose logging |
| `--no-ebpf` | `false` | Disable eBPF; generate synthetic OTLP data instead |

---

## REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/spans` | GET | Recent spans (`?limit=N`) |
| `/api/metrics` | GET | Recent metrics (`?limit=N`) |
| `/api/logs` | GET | Recent logs (`?limit=N`) |
| `/api/stats` | GET | Aggregate counts |
| `/ws` | WS | Real-time telemetry stream |

---

## Project layout

```
co11yctor/
├── bpf/
│   └── otlp_capture.c          # eBPF TC program (clang/bpf2go)
├── cmd/co11yctor/main.go       # Entry point, flag parsing
├── internal/
│   ├── capture/
│   │   ├── capture.go          # Capture manager + simulation
│   │   ├── ebpf.go             # eBPF loader (linux && !nobpf)
│   │   ├── ebpf_stub.go        # Fallback stub (!linux || nobpf)
│   │   ├── gen.go              # go:generate directive for bpf2go
│   │   └── packet.go           # Byte-order helpers
│   ├── otlp/
│   │   ├── parser.go           # gRPC / HTTP OTLP payload parser
│   │   └── types.go            # Span, Metric, LogRecord types
│   ├── storage/
│   │   ├── storage.go          # Storage interface
│   │   └── duckdb.go           # DuckDB implementation
│   └── api/
│       ├── server.go           # HTTP server + WebSocket hub
│       ├── handlers.go         # REST + WS handlers
│       └── static/
│           ├── index.html      # Single-page app
│           └── app.js          # Frontend JavaScript
├── kubernetes/
│   ├── daemonset.yaml
│   ├── rbac.yaml
│   └── service.yaml
├── tests/
│   ├── otlp_test.go
│   └── storage_test.go
├── Dockerfile
├── docker-compose.yml
└── Makefile
```

---

## Docker

```bash
# Build image (includes clang for eBPF compilation)
docker build -t co11yctor .

# Run (simulation mode, no eBPF needed)
docker run --rm -p 8080:8080 co11yctor --no-ebpf

# Run with eBPF (requires --privileged and host network)
docker run --rm --privileged --network host co11yctor -i eth0
```

Or use docker-compose:

```bash
docker-compose up
```

---

## Kubernetes

```bash
# Apply RBAC, DaemonSet, and Service
kubectl apply -f kubernetes/

# Port-forward to the dashboard
kubectl port-forward daemonset/co11yctor 8080:8080
```

The DaemonSet runs as privileged on every node with `hostNetwork: true` so the
eBPF TC hooks can observe all node-level OTLP traffic.

---

## How it works

1. **eBPF TC hooks** — `bpf/otlp_capture.c` attaches two TC programs
   (ingress + egress) to the target interface.  For every TCP packet whose
   source or destination port is **4317** (gRPC) or **4318** (HTTP), the
   program copies up to 4 KB of the TCP payload into a BPF ring buffer.

2. **Ring-buffer consumer** — `internal/capture/ebpf.go` reads events from the
   ring buffer, converts raw byte fields into a `PacketEvent`, and pushes it
   onto an in-process Go channel.

3. **OTLP parser** — `internal/otlp/parser.go` inspects each payload:
   * gRPC: strips the 5-byte length-prefixed framing and unmarshals the
     protobuf `ExportTrace/Metrics/LogsServiceRequest`.
   * HTTP: extracts the body after `\r\n\r\n` and dispatches on
     `Content-Type` (protobuf or JSON).

4. **DuckDB storage** — parsed records are inserted into three tables
   (`spans`, `metrics`, `logs`) and simultaneously pushed onto a Go channel
   that feeds the WebSocket broadcast hub.

5. **Web dashboard** — the embedded SPA connects via WebSocket for live events
   and polls the REST API on demand for historical data.

---

## Development

```bash
# Run tests (no eBPF required)
make test

# Build without eBPF
make build-nobpf

# Generate eBPF Go bindings (requires clang)
make generate

# Full build with eBPF
make build
```

---

## License

MIT