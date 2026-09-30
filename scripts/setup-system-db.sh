#!/usr/bin/env bash
# Moves the school data to the computer's permanent MySQL server (data in /var/lib/mysql, starts at boot).
# Asks once for your sudo password to create the database and its user; everything else runs as you.
#  1. creates database school_db and user school_app (random password) on 127.0.0.1:3306
#  2. copies all data from the database the installed app uses now (e.g. the temporary one on port 3307)
#  3. points the installed app at the new database and restarts it
# Usage: scripts/setup-system-db.sh        (run scripts/deploy.sh first)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/school/api.env"
DB_NAME=school_db
DB_USER=school_app
[ -f "$ENV_FILE" ] || { echo "Run scripts/deploy.sh first (it creates $ENV_FILE)." >&2; exit 1; }

OLD_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')"
case "$OLD_URL" in *"@127.0.0.1:3306/$DB_NAME"*) echo "Already using the permanent database."; exit 0 ;; esac
DB_PASS="$(openssl rand -hex 24)"

echo "▸ Creating the database (sudo password needed)…"
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
NEW_URL="mysql://$DB_USER:$DB_PASS@127.0.0.1:3306/$DB_NAME"

echo "▸ Copying the current data…"
systemctl --user stop school-api.service 2>/dev/null || true
if DATABASE_URL="$OLD_URL" BACKUP_DIR="$HOME/school-backups" "$ROOT/scripts/backup.sh"; then
  LATEST="$(ls -t "$HOME"/school-backups/school-db-*.sql.gz | head -1)"
  gunzip -c "$LATEST" | MYSQL_PWD="$DB_PASS" mysql -h 127.0.0.1 -P 3306 -u "$DB_USER" "$DB_NAME"
  echo "  Copied from $LATEST"
else
  echo "  The old database is not reachable; starting with an empty one."
  (cd "$ROOT/backend" && DATABASE_URL="$NEW_URL" npx prisma migrate deploy)
  echo "  Load the demo school with: cd backend && DATABASE_URL='<see $ENV_FILE>' SEED_FORCE=true npm run seed"
fi

echo "▸ Switching the app to the permanent database…"
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$NEW_URL|" "$ENV_FILE"
systemctl --user restart school-api.service
for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:4000/api/health && break; sleep 1; done
curl -sf -o /dev/null http://127.0.0.1:4000/api/health && echo "✓ Done. The data now survives restarts; backups run every night."
