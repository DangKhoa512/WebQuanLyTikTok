#!/bin/bash
# ── MySQL Database Backup Script ──────────────────────────────────────────────
# Cách dùng: bash scripts/backup-db.sh
# Tự động chạy: thêm vào crontab:
#   0 2 * * * /opt/tiktok-manager/scripts/backup-db.sh >> /var/log/tiktok-backup.log 2>&1

set -euo pipefail

# Load env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../backend/.env"

if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Config
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/tiktok-mysql}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="tiktok_manager_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup: $FILENAME"

# Run dump
mysqldump \
  -h "${DB_HOST:-localhost}" \
  -P "${DB_PORT:-3306}"      \
  -u "${DB_USER:-root}"      \
  -p"${DB_PASS}"             \
  --single-transaction       \
  --quick                    \
  --lock-tables=false        \
  "${DB_NAME:-tiktok_manager}" \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

SIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup done: $FILENAME ($SIZE)"

# Remove old backups
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Removed $DELETED old backup(s)"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete. Files in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"
