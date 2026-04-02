//go:build !linux || nobpf

package capture

import "context"

func (m *Manager) startEBPF(ctx context.Context) error {
	go m.generateSimulatedData(ctx)
	return nil
}
