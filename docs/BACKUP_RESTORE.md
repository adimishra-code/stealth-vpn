# Backups & Restore — Schedule, Verify, Recover

The backup *script* (`scripts/backup-mongo.sh`) only does something once it is
scheduled on the host, and a backup you have never restored is a backup that
will fail you at 2am. This doc covers both: installing the host cron and the
tested restore drill.

## 1. What gets backed up

- `mongodump --archive --gzip` of the `stealthvpn` database
  (users, devices, invoices, server nodes) — a single compressed archive.
- Produced by `scripts/backup-mongo.sh`, which also prunes archives older
  than `RETENTION_DAYS` (default 30).
- The WireGuard private keys of VPN nodes and the backend's SSH key live on
  the host filesystem — **back those up too** (copy `/root/.wg/` and the SSH
  key to your offsite store; they are not in MongoDB).

## 2. Scheduling the host cron

The backend container does not run cron for backups — backups must run on the
host (or a bastion) so they survive a dead container/host.

```bash
# 1. Install scripts + tools on the host
mkdir -p /opt/stealthvpn/scripts /opt/stealthvpn/backups
cp scripts/backup-mongo.sh /opt/stealthvpn/scripts/
chmod +x /opt/stealthvpn/scripts/backup-mongo.sh

# mongodb-database-tools (provides mongodump/mongorestore):
#   Ubuntu:  apt install mongodb-database-tools
#   RHEL:    dnf install mongodb-database-tools
#   Or use the Atlas CLI installer for your distro.

# 2. Test it once, manually
/opt/stealthvpn/scripts/backup-mongo.sh /opt/stealthvpn/backups
ls -la /opt/stealthvpn/backups/$(date +%F)/
# expect: stealthvpn.gz + stealthvpn_dump_complete marker

# 3. Install the cron entry (runs 03:30 daily)
(crontab -l 2>/dev/null; echo "30 3 * * * /opt/stealthvpn/scripts/backup-mongo.sh /opt/stealthvpn/backups >> /var/log/stealthvpn-backup.log 2>&1") | crontab -
crontab -l   # verify it is listed

# 4. Verify it actually fires (wait for the scheduled run, then:)
cat /var/log/stealthvpn-backup.log
```

If MongoDB is remote, export `MONGO_URI` in the crontab entry
(`MONGO_URI=mongodb://...` prefix) — see the script header.

## 3. The restore drill (tested procedure — run monthly)

A backup is only trusted after a full restore+verify round-trip. Never restore
into production directly on your first attempt.

```bash
# ── Step 1: restore into a scratch database ──────────────────────────────────
# Requires mongorestore (same tools package as above) and mongosh.
./scripts/restore-mongo.sh /opt/stealthvpn/backups/$(date +%F)/stealthvpn.gz \
  mongodb://127.0.0.1:27017/stealthvpn-restore-test

# ── Step 2: compare every collection count against production ───────────────
./scripts/verify-backup.sh \
  mongodb://127.0.0.1:27017/stealthvpn \
  mongodb://127.0.0.1:27017/stealthvpn-restore-test
# expect: "VERIFIED: N collections match" and exit code 0

# ── Step 3 (only after Steps 1–2 pass): promote to production ───────────────
# This is destructive (--drop replaces the production data). Stop writes
# first, or accept data newer than the archive will be lost.
./scripts/restore-mongo.sh /opt/stealthvpn/backups/$(date +%F)/stealthvpn.gz \
  mongodb://127.0.0.1:27017/stealthvpn

# ── Step 4: smoke-test the restored app ──────────────────────────────────────
# Log in as an existing user, open the dashboard, download a config.
# Spot-check: invoice totals, device list, server node status.

# ── Step 5: clean up the scratch database ────────────────────────────────────
mongosh mongodb://127.0.0.1:27017/stealthvpn-restore-test \
  --eval 'db.dropDatabase()'
```

Monthly drill checklist (calendar reminder):

- [ ] Fresh backup exists (`backups/<date>/stealthvpn_dump_complete` present)
- [ ] Steps 1–2 above pass with the LATEST archive (restore + verify)
- [ ] If the app's schema changed this month, the verify step still matches
- [ ] Log the run (date, archive used, collection count) in ops notes

## 4. Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Empty `backups/` or no log line | cron not installed / script not executable | re-run step 2–3, check `crontab -l` |
| `mongodump: command not found` | database-tools not installed on host | install tools (script section above) |
| Restore aborts mid-way | archive truncated (disk full during backup) | check `backups/<date>/stealthvpn_dump_complete` marker — absent means the backup failed; it is deleted by rotation, never rely on partial archives |
| Counts mismatch in verify | restore happened while production was being written | acceptable during drills; note it, and use the archive timestamp to bound the diff |
| Host lost (fire, VM gone) | no offsite copy | copy `backups/` to object storage (rclone to S3/B2) and store node private keys offsite too |

## 5. Offsite copy (recommended)

```bash
# After every backup run, sync to object storage:
30 4 * * * rclone sync /opt/stealthvpn/backups backup:bucket/stealthvpn --include "*.gz" --transfers 2
```

Rotation note: `backup-mongo.sh` prunes on the host only. Set matching
retention on the offsite bucket (30 days) so restored data is never newer
than the CERT-In 5-year retention job expects (see `docs/LEGAL.md` §3.2 —
billing records 8 years, CERT-In records 5 years; if legal retention demands
longer, raise `RETENTION_DAYS` accordingly and keep the offsite copy policy
in sync).
