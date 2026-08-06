#!/bin/bash
# StealthVPN — verify a restore by comparing per-collection document counts
# between two databases (source = live production, target = restored).
#
# Usage: ./scripts/verify-backup.sh <source-uri> <target-uri>
# Requires: mongosh in PATH (ships with MongoDB 6+ / mongosh package).
#
# Exits non-zero if any collection count differs — use in the monthly
# restore drill and in CI for the restore test job.

set -euo pipefail

SOURCE_URI="${1:?usage: verify-backup.sh <source-uri> <target-uri>}"
TARGET_URI="${2:?usage: verify-backup.sh <source-uri> <target-uri>}"

collections=$(mongosh "${SOURCE_URI}" --quiet --eval 'db.getCollectionNames().sort().join("\n")' 2>/dev/null)
if [ -z "${collections}" ]; then
  echo "ERROR: could not read collections from ${SOURCE_URI}" >&2
  exit 1
fi

failures=0
count=0
while IFS= read -r coll; do
  [ -z "${coll}" ] && continue
  count=$((count + 1))
  src=$(mongosh "${SOURCE_URI}" --quiet --eval "print(db.getCollection('${coll}').countDocuments({}))" 2>/dev/null || echo "ERROR")
  dst=$(mongosh "${TARGET_URI}" --quiet --eval "print(db.getCollection('${coll}').countDocuments({}))" 2>/dev/null || echo "ERROR")

  if [ "${src}" != "${dst}" ]; then
    echo "MISMATCH ${coll}: source=${src} restored=${dst}"
    failures=$((failures + 1))
  else
    echo "OK ${coll}: ${src}"
  fi
done <<< "${collections}"

echo "---"
if [ "${failures}" -eq 0 ]; then
  echo "VERIFIED: ${count} collections match"
  exit 0
else
  echo "FAILED: ${failures}/${count} collections differ" >&2
  exit 1
fi
