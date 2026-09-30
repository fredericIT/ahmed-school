#!/usr/bin/env bash
# Starts a user-owned MySQL 8 instance for local development (no Docker, no sudo).
# Data lives in $MYSQL_DEV_DIR (default /tmp/school-dev-mysql). Listens on 127.0.0.1:3307.
# Usage: scripts/dev-mysql.sh start|stop|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Ubuntu AppArmor only lets mysqld write under /tmp (and /var/lib/mysql), hence the default.
DIR="${MYSQL_DEV_DIR:-/tmp/school-dev-mysql}"
PORT="${MYSQL_DEV_PORT:-3307}"
SOCK="$DIR/mysqld.sock"
DB_USER="${MYSQL_DEV_USER:-school}"
DB_PASS="${MYSQL_DEV_PASSWORD:-school_pass}"
DB_NAME="${MYSQL_DEV_DB:-school_db}"

start() {
  mkdir -p "$DIR"
  if [ ! -d "$DIR/data" ]; then
    echo "Initializing data directory..."
    mysqld --no-defaults --initialize-insecure --datadir="$DIR/data" --user="$(whoami)" >"$DIR/init.log" 2>&1
    FRESH=1
  fi
  if [ -f "$DIR/mysqld.pid" ] && kill -0 "$(cat "$DIR/mysqld.pid")" 2>/dev/null; then
    echo "Already running on port $PORT"; return
  fi
  mysqld --no-defaults --datadir="$DIR/data" --port="$PORT" --bind-address=127.0.0.1 \
    --socket="$SOCK" --pid-file="$DIR/mysqld.pid" --mysqlx=OFF \
    --log-error="$DIR/error.log" --user="$(whoami)" &
  for _ in $(seq 1 30); do
    mysqladmin --socket="$SOCK" -uroot ping >/dev/null 2>&1 && break; sleep 1
  done
  if [ "${FRESH:-0}" = "1" ]; then
    mysql --socket="$SOCK" -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON *.* TO '$DB_USER'@'%';
GRANT ALL PRIVILEGES ON *.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
  fi
  echo "MySQL running: mysql://$DB_USER:$DB_PASS@127.0.0.1:$PORT/$DB_NAME"
}
stop() {
  [ -f "$DIR/mysqld.pid" ] && kill "$(cat "$DIR/mysqld.pid")" && echo "Stopped" || echo "Not running"
}
status() {
  mysqladmin --socket="$SOCK" -uroot ping 2>/dev/null || echo "Not running"
}
"${1:-start}"
