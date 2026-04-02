//go:build linux && !nobpf

package capture

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"time"
	"unsafe"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

type bpfEvent struct {
	SrcIP      uint32
	DstIP      uint32
	SrcPort    uint16
	DstPort    uint16
	Direction  uint8
	Proto      uint8
	Pad        [2]uint8
	PayloadLen uint32
	Payload    [4096]uint8
}

func (m *Manager) startEBPF(ctx context.Context) error {
	if err := rlimit.RemoveMemlock(); err != nil {
		log.Printf("Warning: failed to remove memlock: %v", err)
	}

	objs := otlpCaptureObjects{}
	if err := loadOtlpCaptureObjects(&objs, nil); err != nil {
		if m.verbose {
			log.Printf("Failed to load eBPF objects: %v, falling back to simulation", err)
		}
		go m.generateSimulatedData(ctx)
		return nil
	}
	defer objs.Close()

	iface, err := net.InterfaceByName(m.iface)
	if err != nil {
		return fmt.Errorf("interface %s not found: %w", m.iface, err)
	}

	ingressLink, err := link.AttachTCX(link.TCXOptions{
		Interface: iface.Index,
		Program:   objs.TcIngress,
		Attach:    ebpf.AttachTCXIngress,
	})
	if err != nil {
		log.Printf("Failed to attach ingress TC: %v", err)
	} else {
		defer ingressLink.Close()
	}

	egressLink, err := link.AttachTCX(link.TCXOptions{
		Interface: iface.Index,
		Program:   objs.TcEgress,
		Attach:    ebpf.AttachTCXEgress,
	})
	if err != nil {
		log.Printf("Failed to attach egress TC: %v", err)
	} else {
		defer egressLink.Close()
	}

	rd, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		return fmt.Errorf("failed to open ring buffer: %w", err)
	}
	defer rd.Close()

	go func() {
		<-ctx.Done()
		rd.Close()
	}()

	go func() {
		for {
			record, err := rd.Read()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("Error reading from ring buffer: %v", err)
				continue
			}

			if len(record.RawSample) < int(unsafe.Sizeof(bpfEvent{})) {
				continue
			}

			var evt bpfEvent
			evt.SrcIP = binary.LittleEndian.Uint32(record.RawSample[0:4])
			evt.DstIP = binary.LittleEndian.Uint32(record.RawSample[4:8])
			evt.SrcPort = binary.LittleEndian.Uint16(record.RawSample[8:10])
			evt.DstPort = binary.LittleEndian.Uint16(record.RawSample[10:12])
			evt.Direction = record.RawSample[12]
			evt.Proto = record.RawSample[13]
			evt.PayloadLen = binary.LittleEndian.Uint32(record.RawSample[16:20])

			payloadLen := evt.PayloadLen
			if payloadLen > 4096 {
				payloadLen = 4096
			}
			payload := make([]byte, payloadLen)
			copy(payload, record.RawSample[20:20+payloadLen])

			direction := "ingress"
			if evt.Direction == 1 {
				direction = "egress"
			}
			proto := "grpc"
			if evt.Proto == 1 {
				proto = "http"
			}

			pkt := PacketEvent{
				SrcIP:      ipToString(evt.SrcIP),
				DstIP:      ipToString(evt.DstIP),
				SrcPort:    evt.SrcPort,
				DstPort:    evt.DstPort,
				Direction:  direction,
				Proto:      proto,
				Payload:    payload,
				CapturedAt: time.Now(),
			}

			select {
			case m.events <- pkt:
			default:
				if m.verbose {
					log.Println("capture: event channel full, dropping packet")
				}
			}
		}
	}()

	<-ctx.Done()
	return nil
}
