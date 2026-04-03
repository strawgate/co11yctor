# co11yctor development tasks

# Default: show available tasks
default:
    @just --list

# Build the Go binary (no eBPF)
build: web-build
    CGO_ENABLED=1 go build -tags nobpf -o co11yctor ./cmd/co11yctor

# Build with eBPF support (Linux only)
build-ebpf: web-build generate
    CGO_ENABLED=1 go build -o co11yctor ./cmd/co11yctor

# Generate eBPF bindings
generate:
    PATH=$HOME/go/bin:$PATH go generate ./internal/capture/...

# Run tests
test:
    CGO_ENABLED=1 go test -tags nobpf -v ./tests/...

# Run Go linting
lint-go:
    golangci-lint run ./...

# Run frontend linting
lint-web:
    cd web && npm run lint

# Run all linters
lint: lint-go lint-web

# Format Go code
fmt-go:
    gofmt -w .

# Format frontend code
fmt-web:
    cd web && npm run format

# Format all code
fmt: fmt-go fmt-web

# Check formatting
fmt-check:
    gofmt -l . | grep -q . && echo "Go files need formatting" && exit 1 || true
    cd web && npm run format:check

# Install frontend dependencies
web-install:
    cd web && npm install

# Build frontend
web-build: web-install
    cd web && npm run build

# Start frontend dev server
web-dev:
    cd web && npm run dev

# Type-check frontend
web-typecheck:
    cd web && npm run typecheck

# Run the application (simulation mode)
run: build
    ./co11yctor --no-ebpf --port 8080

# Run with verbose logging
run-verbose: build
    ./co11yctor --no-ebpf --port 8080 --verbose

# Build Docker image
docker:
    docker build -t co11yctor .

# Clean build artifacts
clean:
    rm -f co11yctor
    rm -rf web/node_modules web/dist
    rm -rf internal/api/static/*.js internal/api/static/*.css internal/api/static/*.html internal/api/static/assets/

# Run E2E tests with Playwright
e2e:
    cd web && npx playwright test

# Run all checks (lint, test, build)
ci: lint test build
