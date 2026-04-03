.PHONY: all build generate test clean docker

BINARY := co11yctor
MODULE := github.com/strawgate/co11yctor

all: generate build

generate:
PATH=$(HOME)/go/bin:$(PATH) go generate ./internal/capture/...

build:
CGO_ENABLED=1 go build -o $(BINARY) ./cmd/co11yctor

build-nobpf:
CGO_ENABLED=1 go build -tags nobpf -o $(BINARY) ./cmd/co11yctor

test:
CGO_ENABLED=1 go test -tags nobpf ./tests/...

clean:
rm -f $(BINARY) internal/capture/otlpcapture_*.go internal/capture/otlpcapture_*.o

docker:
docker build -t co11yctor .
