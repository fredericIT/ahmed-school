#!/usr/bin/env bash
# Backs up the database (mysqldump) and the uploaded photos into BACKUP_DIR, keeping the last KEEP_DAYS days.
# Runs nightly via the school-backup timer; run it by hand any time: scripts/backup.sh
# Restore: gunzip -c school-db-<date>.sql.gz | mysql -h HOST -P PORT -u USER -p DATABASE
#          tar -xzf school-uploads-<date>.tar.gz -C backend/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/school/api.env"
BACKUP_DIR="${BACKUP_DIR:-$HOME/school-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')"
fi
: "${DATABASE_URL:?DATABASE_URL is not set (see $ENV_FILE)}"

# mysql://user:password@host:port/database → its parts (the password may be URL-encoded).
read -r DB_USER DB_PASS DB_HOST DB_PORT DB_NAME < <(python3 - "$DATABASE_URL" <<'PY'
import sys
from urllib.parse import urlparse, unquote
u = urlparse(sys.argv[1])
print(unquote(u.username or ''), unquote(u.password or ''), u.hostname or '127.0.0.1', u.port or 3306, u.path.lstrip('/'))
PY
)

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"

# --single-transaction: a consistent snapshot without locking the school out.
MYSQL_PWD="$DB_PASS" mysqldump --single-transaction --no-tablespaces --routines \
  -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" | gzip >"$BACKUP_DIR/school-db-$STAMP.sql.gz.part"
mv "$BACKUP_DIR/school-db-$STAMP.sql.gz.part" "$BACKUP_DIR/school-db-$STAMP.sql.gz"

tar -czf "$BACKUP_DIR/school-uploads-$STAMP.tar.gz" -C "$ROOT/backend" uploads

find "$BACKUP_DIR" -name 'school-*' -mtime +"$KEEP_DAYS" -delete
echo "Backup saved in $BACKUP_DIR ($STAMP)"
