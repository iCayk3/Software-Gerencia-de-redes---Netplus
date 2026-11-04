#!/bin/sh
set -e

# Se SEED_SAMPLE_DEVICES for "true", inicializa com os dados de demonstração
if [ "$SEED_SAMPLE_DEVICES" = "true" ]; then
    echo "[NetPulse Entrypoint] SEED_SAMPLE_DEVICES=true: Inicializando com equipamentos de demonstração..."
    if [ ! -f "/app/data/devices.json" ] && [ -d "/app/data-default" ]; then
        cp -r /app/data-default/* /app/data/ 2>/dev/null || true
    fi
else
    echo "[NetPulse Entrypoint] 🚀 Inicializando ambiente limpo de produção (sem equipamentos fictícios)..."
    mkdir -p /app/data
    [ -f /app/data/devices.json ] || echo "[]" > /app/data/devices.json
    [ -f /app/data/alerts.json ] || echo "[]" > /app/data/alerts.json
    [ -f /app/data/audit_logs.json ] || echo "[]" > /app/data/audit_logs.json
    [ -f /app/data/traffic_profiles.json ] || echo "[]" > /app/data/traffic_profiles.json
    [ -f /app/data/as_metadata.json ] || echo "[]" > /app/data/as_metadata.json
    [ -f /app/data/peer_metadata.json ] || echo "[]" > /app/data/peer_metadata.json
fi

exec "$@"
