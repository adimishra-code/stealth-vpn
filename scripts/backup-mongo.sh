#!/bin/bash
# StealthVPN — MongoDB backup (mongodump) to a rotating daily folder.
#
# Usage:   ./scripts/backup-mongo.sh [backup-dir]
# Default: /opt/stealthvpn/backups
#
# Restore: mongorestore --drop <backup-dir>/YYYY-MM-DD/
#
# Schedule on the host (NOT inside a container):
#   30 3 * * * /opt/stealthvpn/scripts/backup-mongo.sh >> /var/log/stealthvpn-backup.log 2>&1
#
# Requires: mongodump in PATH (mongodb-database-tools package).

set -euo pipefail

BACKUP_ROOT="${1:-/opt/stealthvpn/backups}"
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/stealthvpn}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TODAY="$(date +%F)"
DEST="${BACKUP_ROOT}/${TODAY}"
mkdir -p "${DEST}"

if [ -f "${DEST}/stealthvpn_dump_complete" ]; then
  echo "$(date -Is) backup already exists for ${TODAY}, skipping"
  exit 0
fi

mongodump --uri "${MONGO_URI}" --out "${DEST}" --archive="${DEST}/stealthvpn.gz" --gzip
touch "${DEST}/stealthvpn_dump_complete"
echo "$(date -Is) backup complete: ${DEST}/stealthvpn.gz ($(du -h "${DEST}/stealthvpn.gz" | cut -f1))"

# Rotate: keep last N days, remove anything older.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +
echo "$(date -Is) rotation: pruned backups older than ${RETENTION_DAYS} days"
