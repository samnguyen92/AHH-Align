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
NEXT_PUBLIC_BASE_URL=http://localhost:4000
WEB_PORT=4000
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

# 5. Check container statuses & wait for web server to be ready
echo "[*] Waiting for services to become ready..."
docker compose ps

PORT="${WEB_PORT:-4000}"
echo "[*] Verifying web application on port $PORT..."
READY=false
for i in {1..15}; do
  if curl -s -f "http://127.0.0.1:$PORT/api/health/supabase" > /dev/null 2>&1 || curl -s -f "http://127.0.0.1:$PORT/" > /dev/null 2>&1; then
    READY=true
    break
  fi
  echo "    Still warming up Next.js... ($i/15)"
  sleep 2
done

SERVER_IP=$(curl -s -m 3 https://ifconfig.me 2>/dev/null || echo "76.13.179.185")

echo "=================================================="
if [ "$READY" = true ]; then
  echo "✅ Deployment complete! Server is running and responding."
else
  echo "⚠️ Containers started, but Next.js is still compiling initial routes."
fi
echo "   - Web App URL: http://$SERVER_IP:$PORT"
echo "   - Health Check: http://$SERVER_IP:$PORT/api/health/supabase"
echo "   - Fetch Photos via Docker:"
echo "     docker compose exec openclaw-bot python /app/scripts/fetch_google_photos_local.py"
echo "=================================================="

