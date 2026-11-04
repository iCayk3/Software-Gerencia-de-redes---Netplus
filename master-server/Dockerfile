# ==============================================================================
# NetPulse Central Master Server - Multi-Stage Dockerfile
# ==============================================================================

# --- Stage 1: Build Binary ---
FROM golang:alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates tzdata

COPY go.mod ./
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/master .

# --- Stage 2: Minimal Runtime ---
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/bin/master /app/bin/master

RUN mkdir -p /app/data && chmod +x /app/bin/master

ENV MASTER_PORT=8090 \
    MASTER_DATA_DIR=/app/data \
    MASTER_ADMIN_PASSWORD=admin_master_secret_2026 \
    MASTER_JWT_SECRET=master_super_secret_key_netpulse_2026_telecom

EXPOSE 8090/tcp

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8090/api/v1/health || exit 1

ENTRYPOINT ["/app/bin/master"]
