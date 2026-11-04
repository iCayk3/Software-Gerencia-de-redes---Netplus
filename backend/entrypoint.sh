#!/bin/sh
set -e

# Initialize /app/data with seed files if newly mounted volume is empty
if [ ! -f "/app/data/devices.json" ] && [ -d "/app/data-default" ]; then
    echo "[NetPulse Entrypoint] Inicializando /app/data com arquivos padrão de demonstração..."
    cp -r /app/data-default/* /app/data/ 2>/dev/null || true
fi

exec "$@"
