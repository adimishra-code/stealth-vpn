# Runbook

Day-to-day operations for StealthVPN. Every command assumes the PM2 process
name `stealth-vpn-backend` from `deploy/ecosystem.config.cjs` and a repo checkout at
`/opt/stealth-vpn`.

## Status

```bash
pm2 list                        # app up/down/restart counts
pm2 status stealth-vpn-backend
pm2 logs stealth-vpn-backend --lines 100          # tail API logs
pm2 logs stealth-vpn-backend --lines 500 --err    # errors only
pm2 monit                        # CPU/memory/restarts
mongosh "$MONGO_URI" --eval "db.serverStatus().connections" | grep current  # Mongo health
curl -s https://<domain>/api/health
curl -s https://<domain>/api/servers | jq '.[] | {name, isOnline}'  # node health
```

## Restart / deploy / rollback

```bash
pm2 restart stealth-vpn-backend                      # quick bounce (10s grace, then SIGKILL)
pm2 reload stealth-vpn-backend --update-env          # after .env changes
pm2 restart stealth-vpn-backend --update-env
cd /opt/stealth-vpn && git pull && cd backend && npm ci && pm2 reload stealth-vpn-backend --update-env
git checkout <previous-tag> && pm2 restart stealth-vpn-backend   # rollback
```

After any manual `pm2 kill` or host reboot, `pm2 save` + `pm2 startup` restore
the process list (already set during deployment; re-run if you changed the app
path).

## Billing incidents

### "Customer paid but no device"

Check the webhook log for `[WEBHOOK FAIL]` lines — these are fired when a
post-payment SSH cleanup (throttle removal on plan upgrade) fails; the payment
itself succeeded and is safe:

```bash
pm2 logs stealth-vpn-backend --lines 2000 | grep '\[WEBHOOK FAIL\]'
```

Then verify against the gateway dashboard (Razorpay/Stripe) — if the payment
succeeded there but the plan did not apply, the renewal is recoverable:

```bash
mongosh "$MONGO_URI" stealthvpn --eval 'db.users.updateOne({email:"<email>"},{$set:{plan:"pro",planExpiresAt:new Date(Date.now()+30*86400000),isActive:true}})'
```

### Duplicate webhook / double credit

Webhook handling is idempotent: a delivery is claimed atomically
(`pending → paid`) before any credit, so redeliveries cannot double-apply.
Nothing to do — investigate only if you see repeated `[WEBHOOK FAIL]` entries.

## Node incidents

### Node offline

Health cron (every 2 min) alerts; devices on that node keep their tunnels but
are unmanaged while the node is down:

```bash
ssh root@<node-ip> 'systemctl status wg-quick@wg0 xray'
ssh root@<node-ip> 'journalctl -u xray --no-pager -n 50'
ssh root@<node-ip> 'wg show'
```

Expected cause: node host rebooted, WireGuard/Xray stopped, or UFW dropped the
rule. Restart: `systemctl restart wg-quick@wg0 xray`.

### IP pool exhaustion

`GET /api/admin/pool-status` (admin token) reports per-node `pct`. The backend
also prints `[POOL WARN]` at ≥80%. At 100%, new signups get 503 "at capacity".

- Reclaim: revoke dead devices (`/api/admin/devices`), or
- Add capacity: a fresh node with a new `WG_IP_POOL` range and `npm run seed`-style
  `ServerNode` document.

## Cron jobs

| Job                | Schedule (UTC) | What it does                                   |
|--------------------|----------------|------------------------------------------------|
| Expiry             | 02:00 daily    | Renewal warnings → revocation at end of plan   |
| Bandwidth sync     | every 5 min    | Pulls per-user deltas from Xray nodes          |
| Snapshots          | 00:00 daily    | Daily GB totals per node (`BandwidthSnapshot`) |
| Health checks      | every 2 min    | Node SSH + latency → alert on failure          |
| Pending invoices   | hourly         | Marks orders stuck pending > 2h as `abandoned` |

All four log `... cron skipped — previous run still active` if a pass is still
running when the next tick fires — that is normal throttling, not a fault.

Quota enforcement (`QUOTA_ENFORCE=true`) revokes devices past their plan quota
during the 5-minute bandwidth pass.

## Log rotation & hardening

### pm2-logrotate (install once on the control plane)

PM2 out/err files grow forever without rotation — the host disk fills up
silently. Install and configure:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

nginx and Xray node logs rotate via `/etc/logrotate.d/` (default weekly).

### fail2ban (optional but recommended)

The API rate-limits login/register at the app layer, but fail2ban adds a
network-level block against brute-forcers that would otherwise keep hammering
TLS. One jail on the control-plane host, watching nginx's access log:

```bash
apt install fail2ban
cat > /etc/fail2ban/filter.d/stealthvpn-nginx.conf <<'EOF'
[Definition]
failregex = ^<HOST> .* "POST /api/auth/(login|register|forgot-password) .* 4\d\d
ignoreregex =
EOF
cat > /etc/fail2ban/jail.d/stealthvpn.local <<'EOF'
[stealthvpn-nginx]
enabled  = true
port     = http,https
filter   = stealthvpn-nginx
logpath  = /var/log/nginx/access.log
maxretry = 10
findtime = 900
bantime  = 3600
EOF
systemctl enable --now fail2ban
fail2ban-client status stealthvpn-nginx
```

Ban window 1h, 10 failures in 15 min. Never ban the API's own IP (`ignoreip`
in `jail.d` if the API and nginx share a host).

## IP reputation monitoring

A VPN IP that lands on an abuse blocklist (Spamhaus & co.) breaks stealth and
can get the host null-routed by the provider. `deploy/scripts/check-ip-reputation.sh`
checks the control plane + every node IP against common DNSBLs (and prints the
ipinfo.io abuse contact for follow-up):

```bash
apt install dnsutils
./deploy/scripts/check-ip-reputation.sh
```

Run weekly from cron — a LISTED hit must be investigated, not ignored:

```bash
15 4 * * 1 /srv/stealthvpn/deploy/scripts/check-ip-reputation.sh >> /var/log/stealthvpn-reputation.log 2>&1
```

Response to a listing: open the listed zone's lookup (the script prints the
return code), file the removal request with the zone operator (Spamhaus SBL /
SpamCop lookup + delisting), and check what abuse reports triggered it
(outbound spam/port scans from a compromised client — see
`docs/INCIDENT_RESPONSE.md`).

## Alerts

Alert channels are configured in `.env` (`ALERT_EMAIL_TO`, `ALERT_WEBHOOK_URL`,
`SENTRY_DSN`) — all optional. Sources: 5xx API errors, cron failures, node-down,
process crash. Dedup + hourly throttling are described in `docs/ALERTING.md`.

## Backup / restore

```bash
# automated (see docs/BACKUP_RESTORE.md for the full workflow):
mongodump --uri="$MONGO_URI" --out=/var/backups/stealthvpn/$(date +%F)
# restore:
mongorestore --uri="$MONGO_URI" --drop /var/backups/stealthvpn/<date>
```

Back up: Mongo, `backend/.env` (contains node keys/secrets), and
`/etc/wireguard` + `/etc/xray` on every node (offline key copies:
`docs/BACKUP_KEY_SETUP.md`).

Node config snapshots + drift detection (weekly; a manifest diff without a
deploy means an intruder may have touched node config):

```bash
15 3 * * 0 /srv/stealthvpn/deploy/scripts/config-snapshot.sh >> /var/log/stealthvpn-snapshots.log 2>&1
```

## Certificate renewal

```bash
certbot renew --dry-run     # certbot.timer runs this automatically twice daily
systemctl list-timers certbot.timer
```

A deploy hook reloads nginx after each successful renewal (installed by
`deploy/certbot-setup.sh`).

## Troubleshooting checklist

1. `pm2 logs stealth-vpn-backend --err --lines 200` — exceptions with stack traces.
2. `curl -s https://<domain>/api/health` — DB connectivity + app version.
3. `pm2 describe stealth-vpn-backend` — restart count (crash loop? memory cap?).
4. Boot log — look for `SMTP misconfigured` (mail silently broken) and
   `[POOL WARN]` (capacity).
5. Node unreachable? SSH from the control plane to the node with the exact key
   at `SSH_PRIVATE_KEY_PATH`.
