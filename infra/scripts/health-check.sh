#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"

echo "Checking NOVA ORG services health..."

# 1. API Health
HEALTH_RES=$(curl -s "${API_URL}/health" || echo '{"status":"down"}')
if echo "${HEALTH_RES}" | grep -q '"status":"ok"'; then
    echo "[OK] Fastify API is HEALTHY"
else
    echo "[FAIL] Fastify API is UNHEALTHY or DOWN: ${HEALTH_RES}"
    exit 1
fi

# 2. Redis Ping
if docker exec -t nova-org-prod-redis-1 redis-cli ping | grep -q 'PONG'; then
    echo "[OK] Redis is HEALTHY"
else
    echo "[FAIL] Redis is UNHEALTHY"
    exit 1
fi

# 3. Postgres Ready Check
if docker exec -t nova-org-prod-postgres-1 pg_isready -U nova -d nova_org | grep -q 'accepting connections'; then
    echo "[OK] PostgreSQL is HEALTHY"
else
    echo "[FAIL] PostgreSQL is UNHEALTHY"
    exit 1
fi

echo "All services are functioning properly!"
