package capture

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang -cflags "-O2 -g -Wall -Werror -target bpf" OtlpCapture ../../bpf/otlp_capture.c
