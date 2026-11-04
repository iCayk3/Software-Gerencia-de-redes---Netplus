# ==============================================================================
# NetPulse Backend Dockerfile - Multi-Stage Build (Go Alpine)
# ==============================================================================

# --- Stage 1: Build Binary ---
FROM golang:alpine AS builder

WORKDIR /src

RUN apk add --no-cache git ca-certificates tzdata

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Compile static Linux binary without CGO
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/api ./cmd/api

# --- Stage 2: Production Minimal Runtime ---
FROM alpine:3.20

WORKDIR /app

# Install ca-certificates (for HTTPS/RPKI lookups), tzdata, and iputils-ping (for ICMP router ping)
RUN apk add --no-cache ca-certificates tzdata iputils-ping

# Copy compiled binary, entrypoint, migrations, and seed data
COPY --from=builder /app/bin/api /app/bin/api
COPY entrypoint.sh /app/entrypoint.sh
COPY migrations /app/migrations
COPY data /app/data-default

RUN chmod +x /app/entrypoint.sh /app/bin/api && mkdir -p /app/data

ENV PORT=8080 \
    DATA_DIR=/app/data \
    SYSLOG_PORT=1514 \
    BMP_PORT=11019 \
    POLL_INTERVAL=45 \
    DISABLE_LICENSE_CHECK=true \
    NETPULSE_STANDALONE_MODE=true

# Expose ports:
# - 8080: NetPulse REST API & SSE Events
# - 11019/tcp: BGP Monitoring Protocol (BMP - RFC 7854)
# - 1514/udp: Syslog Receiver for router events
EXPOSE 8080/tcp 11019/tcp 1514/udp

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh", "/app/bin/api"]
