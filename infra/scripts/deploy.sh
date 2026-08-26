#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "   NOVA ORG Automated Production Deploy  "
echo "========================================="

# 1. Pull latest changes
echo "--> Pulling latest git repository changes..."
git pull origin main

# 2. Verify environment file
if [ ! -f ".env" ]; then
    echo "[ERROR] Production .env file is missing!"
    exit 1
fi

# 3. Build and test locally before deploying
echo "--> Running typecheck and tests..."
npm run typecheck
npm run test -w @nova-org/api

# 4. Generate Prisma client & apply database migrations
echo "--> Applying database migrations..."
npm run prisma:generate -w @nova-org/db
npm run prisma:deploy -w @nova-org/db

# 5. Build and restart Docker Compose production stack
echo "--> Rebuilding and launching production containers..."
docker compose -f infra/docker/docker-compose.prod.yml build --no-cache
docker compose -f infra/docker/docker-compose.prod.yml up -d --remove-orphans

# 6. Verify health check endpoint
echo "--> Verifying API health status..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health || true)

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "[SUCCESS] Deployment completed successfully! API is live and healthy."
else
    echo "[WARNING] API health check returned HTTP status $HTTP_STATUS"
    exit 1
fi
