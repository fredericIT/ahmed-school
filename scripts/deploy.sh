#!/usr/bin/env bash
# Installs the school system on this machine as always-on services (no Docker, no sudo):
# builds the production apps, applies database migrations, and (re)starts two systemd user services
# that start at boot and restart if they stop, plus a nightly backup timer.
# Run it again after every code update. Usage: scripts/deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/school"
ENV_FILE="$CONF_DIR/api.env"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
# The real Node binary (version managers often put a wrapper script first on PATH).
NODE="$(node -p process.execPath)"
NODE_DIR="$(dirname "$NODE")"
# 127.0.0.1 rather than localhost: Node may resolve localhost to ::1, where the API does not listen.
BACKEND_URL="http://127.0.0.1:4000"

mkdir -p "$CONF_DIR" "$UNIT_DIR"
chmod 700 "$CONF_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE (production settings, fresh secrets)…"
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  # Until scripts/setup-system-db.sh has run, use the development database.
  DEV_URL="$(grep -E '^DATABASE_URL=' "$ROOT/backend/.env" | cut -d= -f2- | tr -d '"')"
  umask 077
  cat >"$ENV_FILE" <<EOF
# Production settings for the school API. They override backend/.env.
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
DATABASE_URL=$DEV_URL
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
# Address staff open in their browser; used in password-reset and activation emails.
APP_URL=http://${LAN_IP:-localhost}:3000
CORS_ORIGIN=http://${LAN_IP:-localhost}:3000,http://localhost:3000
COOKIE_SECURE=false
LOGIN_RATE_LIMIT=20
LOG_LEVEL=info
EOF
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

echo "▸ Applying database migrations…"
(cd "$ROOT/backend" && npx prisma migrate deploy)

echo "▸ Building the API…"
(cd "$ROOT/backend" && npm run --silent build)

# The development servers use the same ports (and .next); stop them.
if pgrep -f "tsx watch src/server.ts" >/dev/null; then
  echo "  Stopping the development API (npm run dev:api)"
  pkill -f "tsx watch src/server.ts" || true
fi

echo "▸ Building the web app (takes a minute)…"
if pgrep -f "next dev" >/dev/null; then
  echo "  Stopping the development web server (npm run dev) so the build can use .next"
  pkill -f "next dev" || true
fi
(cd "$ROOT/frontend" && BACKEND_URL="$BACKEND_URL" NODE_ENV=production npm run --silent build)
# The standalone server needs the static files next to it.
rm -rf "$ROOT/frontend/.next/standalone/.next/static" "$ROOT/frontend/.next/standalone/public"
cp -r "$ROOT/frontend/.next/static" "$ROOT/frontend/.next/standalone/.next/static"
cp -r "$ROOT/frontend/public" "$ROOT/frontend/.next/standalone/public"

echo "▸ Installing services…"
for unit in "$ROOT"/deploy/*.service "$ROOT"/deploy/*.timer; do
  sed -e "s|@ROOT@|$ROOT|g" -e "s|@NODE@|$NODE|g" -e "s|@NODE_DIR@|$NODE_DIR|g" -e "s|@ENV_FILE@|$ENV_FILE|g" \
    -e "s|@BACKEND_URL@|$BACKEND_URL|g" "$unit" >"$UNIT_DIR/$(basename "$unit")"
done
systemctl --user daemon-reload
systemctl --user enable --now school-backup.timer >/dev/null
systemctl --user enable school-api.service school-web.service >/dev/null
systemctl --user restart school-api.service school-web.service

echo "▸ Waiting for the apps…"
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:4000/api/health && curl -sf -o /dev/null http://127.0.0.1:3000/login && break
  sleep 1
done
if curl -sf -o /dev/null http://127.0.0.1:3000/login; then
  echo "✓ Running. Open http://localhost:3000 (other devices: ${APP_URL})"
else
  echo "✗ Not answering yet. Logs: journalctl --user -u school-api -u school-web -n 50" >&2
  exit 1
fi
