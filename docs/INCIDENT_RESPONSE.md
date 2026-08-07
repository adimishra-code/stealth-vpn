# Incident Response

What to do when something bad happens. The tools referenced live in
`deploy/scripts/`; the playbook below assumes you can reach the control plane
(and, where noted, the nodes) over SSH.

**General rule: contain first, investigate second.** Burning a tunnel costs
minutes; a data breach costs months.

---

## Toolbox

| Tool | What it does |
|---|---|
| `deploy/scripts/revoke-all.sh` | Removes **every** WireGuard peer on every node (survives reboot via `wg-quick save`). |
| `deploy/scripts/killswitch.sh` | Stops **xray + wg0** on every node — all tunnel traffic dies in seconds. |
| `scripts/backup-mongo.sh` | Encrypted-style dump (gzip) of MongoDB to a rotating daily dir. |
| `scripts/restore-mongo.sh` | Restore a dump (destructive — `--drop`; drill in `docs/BACKUP_RESTORE.md`). |
| `scripts/health-check.sh` | Node health + traffic check from the control plane. |

Restore after a killswitch (per node, as root):

```bash
systemctl start wg-quick@wg0 && systemctl start xray && systemctl restart unbound
```

---

## Scenario 1 — Node compromise (ssh key, shell on a node)

1. **Contain:** `./deploy/scripts/killswitch.sh` — kills xray + wg0 on every
   node immediately (a compromised node can attack peers).
2. `./deploy/scripts/revoke-all.sh` — even if the attacker re-enabled wg0, all
   client configs are now dead.
3. **Preserve evidence:** snapshot the node (`cp -a /var/log`, `dmesg`,
   `journalctl -u ssh`); do not reboot until forensics copies are taken.
4. Rotate the node's SSH host key, the control-plane's SSH key that reached
   it, and `NODE_<NAME>_*` credentials (restore the node from
   `scripts/provision-node.sh` on a fresh VPS).
5. Regenerate WireGuard + REALITY keypairs (the old ones are burned).
6. Rebuild the node from `scripts/provision-node.sh`, re-provision clients
   (they re-import from the dashboard — old configs stay dead).

## Scenario 2 — MongoDB breach / database exfiltration

1. **Contain:** rotate credentials + isolate: stop the app
   (`pm2 stop stealth-vpn-backend`), change `MONGO_ADMIN_PASSWORD` /
   `MONGO_APP_PASSWORD` in `.env` + `deploy/ecosystem.config.cjs`, restart
   mongod (`setup.sh`'s auth block re-runs idempotently).
2. **Assess exposure:** the DB holds emails, bcrypt hashes (cost 12), WG
   private keys (AES-256-GCM with `WG_ENCRYPTION_KEY`), refresh-token digests.
   Users never see payment data (Razorpay/Stripe tokenized server-side).
3. **Force rotation:** `npm run rotate-devices` (or revoke devices in the
   admin panel) so every client config is reissued; then
   `./deploy/scripts/revoke-all.sh` to kill old configs on the nodes.
4. Notify: per `docs/LEGAL.md` — 72h breach notice where applicable.

## Scenario 3 — Payment keys leaked (Razorpay/Stripe)

1. Revoke/rotate `RAZORPAY_KEY_SECRET` + `STRIPE_SECRET_KEY` in the provider
   dashboards (kill active sessions there).
2. Replace values in `.env`, then `pm2 restart stealth-vpn-backend
   --update-env`.
3. Webhook secrets too — the webhook endpoints reject anything signed with
   the old secret once rotated.
4. Check provider dashboards for anomalous charges/refunds during the window.

## Scenario 4 — Legal request / compelled disclosure

1. **Contain:** `./deploy/scripts/revoke-all.sh` (a compelled subpoena may
   target an individual user — revoking everything is the honest floor) or
   revoke the named device in the admin panel if the scope is narrow.
2. Preserve the requested records intact; do not destroy anything (spoliation
   is a separate offence).
3. Contact counsel before producing anything. `docs/LEGAL.md` states the
   retention policy — follow it exactly.

## Scenario 5 — DNS / domain / TLS compromise (control plane)

1. The control plane's nginx is the front door: check
   `systemctl status nginx`, `/var/log/nginx/error.log`, and that the cert
   bundle wasn't replaced (`ls -la /etc/letsencrypt/live/`).
2. Rotate the API's JWT material — **this logs every user out** (refresh
   tokens die with the old keys). If ES256 is enabled (JWT-01, keys from
   `scripts/generate-jwt-keys.js`) regenerate the access + refresh key pairs;
   otherwise rotate `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — then restart
   PM2.
3. Re-issue the TLS cert (`deploy/certbot-setup.sh`), rotate DNS provider
   credentials, enable DNSSEC if the registrar supports it.
4. Grep `access.log` (query strings are no longer logged — tokens were never
   persisted), rotate `ALERT_WEBHOOK_URL` if it may have been captured.

---

## After-action checklist (every incident)

- [ ] Contained (traffic stopped / credentials rotated) — timestamped
- [ ] Evidence preserved (logs, dumps) before any restore
- [ ] All secrets the attacker could have seen rotated (env, SSH keys, node
      keys, payment keys, JWT secrets)
- [ ] `pm2 restart stealth-vpn-backend --update-env` applied
- [ ] Health checks green for 30 min: `scripts/health-check.sh`
- [ ] Users notified per `docs/LEGAL.md` timelines (72h for GDPR)
- [ ] Post-mortem note appended to this file's repo history (or a sibling doc)
