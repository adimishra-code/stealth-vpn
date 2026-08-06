#!/bin/bash
# StealthVPN — restore a mongodump archive and verify it.
#
# Usage:   ./scripts/restore-mongo.sh <archive.gz> [target-uri]
#   <archive.gz>  backup produced by backup-mongo.sh (mongodump --archive --gzip)
#   [target-uri]  defaults to ${MONGO_URI:-mongodb://127.0.0.1:27017/stealthvpn}
#
# Restoring to PRODUCTION is destructive: --drop replaces the existing
# database contents. Do NOT do that directly — follow the drill in
# docs/BACKUP_RESTORE.md:
#   1. restore to a scratch database (e.g. stealthvpn-restore-test)
#   2. run verify-backup.sh to compare collection counts against production
#   3. only then restore to the production database

set -euo pipefail

ARCHIVE="${1:?usage: restore-mongo.sh <archive.gz> [target-uri]}"
TARGET_URI="${2:-${MONGO_URI:-mongodb://127.0.0.1:27017/stealthvpn}}"

if [ ! -f "${ARCHIVE}" ]; then
  echo "ERROR: backup archive not found: ${ARCHIVE}" >&2
  exit 1
fi

echo "Restoring ${ARCHIVE} -> ${TARGET_URI}"
mongorestore --uri "${TARGET_URI}" --archive="${ARCHIVE}" --gzip --drop
echo "Restore complete."
