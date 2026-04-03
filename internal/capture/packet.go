package capture

import "encoding/binary"

// ParseUint16BE parses a big-endian uint16 from a byte slice.
func ParseUint16BE(b []byte) uint16 {
	return binary.BigEndian.Uint16(b)
}

// ParseUint32BE parses a big-endian uint32 from a byte slice.
func ParseUint32BE(b []byte) uint32 {
	return binary.BigEndian.Uint32(b)
}
