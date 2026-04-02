package capture

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/strawgate/co11yctor/internal/otlp"
)

// PacketEvent represents a captured network packet containing OTLP data.
type PacketEvent struct {
	SrcIP      string
	DstIP      string
	SrcPort    uint16
	DstPort    uint16
	Direction  string
	Proto      string
	Payload    []byte
	CapturedAt time.Time
}

// Manager handles packet capture from a network interface.
type Manager struct {
	iface   string
	events  chan PacketEvent
	parser  *otlp.Parser
	useEBPF bool
	verbose bool
}

// New creates a new capture Manager.
func New(iface string, useEBPF bool, verbose bool) *Manager {
	return &Manager{
		iface:   iface,
		events:  make(chan PacketEvent, 1000),
		parser:  otlp.NewParser(),
		useEBPF: useEBPF,
		verbose: verbose,
	}
}

// Events returns the channel of captured packet events.
func (m *Manager) Events() <-chan PacketEvent {
	return m.events
}

// Start begins packet capture.
func (m *Manager) Start(ctx context.Context) error {
	if m.useEBPF {
		return m.startEBPF(ctx)
	}
	go m.generateSimulatedData(ctx)
	return nil
}

func (m *Manager) generateSimulatedData(ctx context.Context) {
	services := []string{"frontend", "backend", "database", "cache", "queue"}
	operations := []string{"HTTP GET /api/users", "HTTP POST /api/orders", "DB SELECT users", "Cache GET key", "Queue Publish"}
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	i := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			svc := services[i%len(services)]
			op := operations[i%len(operations)]
			i++

			payload := fmt.Appendf(nil,
				`{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"%s"}}]},"scopeSpans":[{"spans":[{"traceId":"abc123","spanId":"def456","name":"%s","startTimeUnixNano":%d,"endTimeUnixNano":%d,"status":{"code":1}}]}]}]}`,
				svc, op,
				time.Now().Add(-100*time.Millisecond).UnixNano(),
				time.Now().UnixNano(),
			)

			select {
			case m.events <- PacketEvent{
				SrcIP:      "10.0.0.1",
				DstIP:      "10.0.0.2",
				SrcPort:    12345,
				DstPort:    4318,
				Direction:  "ingress",
				Proto:      "http",
				Payload:    payload,
				CapturedAt: time.Now(),
			}:
			default:
				if m.verbose {
					log.Println("capture: event channel full, dropping simulated event")
				}
			}
		}
	}
}

// ipToString converts a uint32 IP (little-endian) to dotted decimal string.
func ipToString(ip uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d",
		byte(ip), byte(ip>>8), byte(ip>>16), byte(ip>>24))
}
