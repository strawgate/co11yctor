FROM golang:1.24 AS builder
RUN apt-get update && apt-get install -y clang llvm libbpf-dev \
    && ln -s /usr/include/$(uname -m)-linux-gnu/asm /usr/include/asm
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN PATH=$HOME/go/bin:$PATH go install github.com/cilium/ebpf/cmd/bpf2go@latest
RUN PATH=$HOME/go/bin:$PATH go generate ./internal/capture/...
RUN CGO_ENABLED=1 go build -o co11yctor ./cmd/co11yctor

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/co11yctor /usr/local/bin/co11yctor
EXPOSE 8080
ENTRYPOINT ["co11yctor"]
