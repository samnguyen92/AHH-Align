#!/bin/bash
# ==============================================================================
# deploy_hostinger_vps.sh — One-click deploy script for Asian Health Hub on VPS
# ==============================================================================

set -e

echo "=================================================="
echo "🚀 Deploying Asian Health Hub on Hostinger VPS"
echo "=================================================="

# 1. Check Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo "[!] Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

if ! docker compose version &> /dev/null; then
    echo "[!] docker compose plugin not found. Installing..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

# 2. Create required host folders
mkdir -p public/uploads
mkdir -p postgres/init
mkdir -p openclaw/reports

# 3. Verify .env files exist
if [ ! -f .env.local ]; then
    echo "[!] .env.local not found. Creating default production env..."
    cat <<EOT > .env.local
DATABASE_URL=postgresql://postgres:ahh_secure_pass_2026@db:5432/asian_health_hub
POSTGRES_DB=asian_health_hub
POSTGRES_USER=postgres
POSTGRES_PASSWORD=ahh_secure_pass_2026
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_TELEMETRY_DISABLED=1
EOT
fi

if [ ! -f openclaw/.env ]; then
    echo "[!] openclaw/.env not found. Creating default..."
    cat <<EOT > openclaw/.env
DATABASE_URL=postgresql://postgres:ahh_secure_pass_2026@db:5432/asian_health_hub
OPENCLAW_PREVIEW_BASE_URL=http://web:3000
EOT
fi

# 4. Build and start containers
echo "[*] Building and starting Docker services (PostgreSQL 16 + Next.js + OpenClaw)..."
docker compose down || true
docker compose up -d --build

# 5. Check container statuses
echo "[*] Waiting for services to become healthy..."
sleep 5
docker compose ps

echo "=================================================="
echo "✅ Deployment complete!"
echo "   - Web App: http://localhost:3000"
echo "   - PostgreSQL: db:5432 (internal)"
echo "   - Storage: public/uploads/ (Docker Volume)"
echo "=================================================="

