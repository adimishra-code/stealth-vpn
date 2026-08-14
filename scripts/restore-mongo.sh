#!/bin/bash
# StealthVPN — restore a mongodump archive and verify it.
#
# Usage:   ./scripts/restore-mongo.sh <archive.gz> [target-uri] [--yes]
#   <archive.gz>  backup produced by backup-mongo.sh (mongodump --archive --gzip)
#   [target-uri]  defaults to ${MONGO_URI:-mongodb://127.0.0.1:27017/stealthvpn}
#   [--yes]       required to restore to any NON-localhost target
#
# Destructive (--drop): non-localhost targets demand explicit --yes. Drill:
#   1. restore to a scratch database (e.g. stealthvpn-restore-test)
#   2. run verify-backup.sh to compare collection counts against production
#   3. only then restore to the production database

set -euo pipefail

ARCHIVE="${1:?usage: restore-mongo.sh <archive.gz> [target-uri] [--yes]}"
shift || true
CONFIRMED=0
TARGET_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/stealthvpn}"
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRMED=1 ;;
    *) TARGET_URI="$arg" ;;
  esac
done

if [ ! -f "${ARCHIVE}" ]; then
  echo "ERROR: backup archive not found: ${ARCHIVE}" >&2
  exit 1
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "ERROR: mongorestore not found — install mongodb-database-tools" >&2
  exit 1
fi

HOST_PART="${TARGET_URI#*@}"          # strip credentials
HOST_PART="${HOST_PART#mongodb://}"
HOST_PART="${HOST_PART%%[:/]*}"
if [[ "${HOST_PART}" != "127.0.0.1" && "${HOST_PART}" != "localhost" && "${CONFIRMED}" -ne 1 ]]; then
  echo "ERROR: refusing to restore to non-localhost target '${HOST_PART}' without --yes." >&2
  echo "       Re-run with --yes only if you are certain this is intended." >&2
  exit 1
fi

echo "Restoring ${ARCHIVE} -> ${TARGET_URI}"
mongorestore --uri "${TARGET_URI}" --archive="${ARCHIVE}" --gzip --drop
echo "Restore complete."
