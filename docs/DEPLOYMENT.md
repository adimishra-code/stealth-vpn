# Deployment

End-to-end guide for putting StealthVPN into production on a VPS. Two roles:

- **Control-plane host** — runs MongoDB, the API (PM2), nginx + TLS, and serves
  the frontend build. No WireGuard/Xray on this host.
- **VPN node hosts** — run WireGuard + Xray/REALITY only. Each node needs its
  own public IP so Xray can own raw port 443 (REALITY impersonates a TLS 1.3
  site, which cannot share 443 with nginx). The control-plane's own nginx
  therefore lives on a different host/IP than every node.

> All-in-one (control plane + node on one IP) does NOT support nginx TLS on 443
> — Reality must have raw 443. If you try it anyway, run nginx on a different
> port and accept the lost stealth.

Steps 1–4 happen on each **VPN node**; steps 5–12 on the **control plane**.

---

## 1. VPN node — WireGuard keypair

```bash
mkdir -p /etc/wireguard && umask 077 && wg genkey | tee /etc/wireguard/server_private.key | wg pubkey
# save the public key — it goes into NODE_<NAME>_WG_PUBLIC_KEY on the control plane
```

## 2. VPN node — Xray REALITY keypair

```bash
xray x25519 > /etc/xray/reality_keys.txt   # after installing xray (step 3)
cat /etc/xray/reality_keys.txt             # save the PUBLIC key + short id (step 4)
```

## 3. VPN node — bootstrap

```bash
apt update -y
apt install -y wireguard python3 curl ufw openssl
bash <(curl -sL https://github.com/XTLS/Xray-install/raw/main/install-release.sh) @ install --version v1.8.11
systemctl enable --now xray mongod 2>/dev/null || true
```

`deploy/setup.sh` automates this (WireGuard interface, UFW, Xray config). It is
designed to run once on a fresh Ubuntu 22.04/24.04 VPS:

```bash
cp deploy/setup.sh /srv/stealthvpn/setup.sh && chmod +x /srv/stealthvpn/setup.sh
# fill WG_SERVER_PUBLIC_IP, WG_SERVER_PUBLIC_KEY, WG_IP_POOL, XRAY_SNI_DEST in backend/.env first
/srv/stealthvpn/setup.sh
```

For pure nodes, `scripts/provision-node.sh` covers the same ground. Both scripts
create the unprivileged `stealthnode` operator user and install its sudoers
whitelist (only `wg set wg0`, `wg show`, `wg-quick save wg0`, `tc class/filter`,
`xray api` — no shell). Root login is disabled (`DenyUsers root`).

**Before the API can reach the node** (do this once, as root):

```bash
mkdir -p /home/stealthnode/.ssh && chmod 700 /home/stealthnode/.ssh
echo '<control-plane ssh public key>' >> /home/stealthnode/.ssh/authorized_keys
chmod 600 /home/stealthnode/.ssh/authorized_keys && chown -R stealthnode:stealthnode /home/stealthnode/.ssh
```

## 4. VPN node — short id

```bash
openssl rand -hex 8
# 16 hex chars, e.g. 3c1f4a9b2d5e8f01 — goes into NODE_<NAME>_REALITY_SHORT_ID
```

---

## 5. Control plane — prerequisites

Ubuntu 22.04/24.04, Node.js 20+, MongoDB 7, nginx, pm2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs nginx
apt install -y mongodb-org ufw fail2ban openssl  # or your preferred MongoDB install
npm install -g pm2
```

## 6. Control plane — code

```bash
git clone <your-repo> /opt/stealth-vpn
cd /opt/stealth-vpn/backend
npm ci
cp .env.example .env && nano .env   # fill every required value (see below)
npm run seed                        # creates mumbai + frankfurt ServerNode docs
```

Required `.env` values:

- `MONGO_URI` — MongoDB connection string **with credentials** — e.g.
  `mongodb://stealthApp:<app-password>@127.0.0.1:27017/stealthvpn?authSource=stealthvpn`.
  MongoDB auth is mandatory: `deploy/setup.sh` enables `authorization: enabled`
  and creates the `stealthAdmin` (admin db, root role) + `stealthApp`
  (stealthvpn db, readWrite) users — set `MONGO_ADMIN_PASSWORD` /
  `MONGO_APP_PASSWORD` in `.env` first (alphanumeric only).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WG_ENCRYPTION_KEY` — three
  separate 64-char hex strings (`openssl rand -hex 32`)
- `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, `STRIPE_SECRET_KEY/WEBHOOK_SECRET`
- `SSH_PRIVATE_KEY_PATH` — control-plane private key that can reach every node
- `NODE_SSH_USER=stealthnode` — non-root login user created by the node scripts
  (step 3); the API never connects to a node as root
- `SMTP_*` + `EMAIL_FROM` — transactional mail
- `NODE_MUMBAI_*`, `NODE_FRANKFURT_*` — IP, WG public key, REALITY public key,
  short id from steps 1–4
- `FRONTEND_URL=https://<your-domain>`, `TRUST_PROXY=1` (nginx in front)

Keys that may stay empty: the whole `ALERT_*` block, `SENTRY_DSN`,
`ALERT_WEBHOOK_URL`.

## 7. Control plane — frontend

```bash
cd /opt/stealth-vpn/frontend
npm ci
npx vite build          # output: dist/ — served by nginx
```

## 8. Control plane — nginx + TLS

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/stealth-vpn
# replace every "stealthvpn.example.com" with your real domain
ln -s /etc/nginx/sites-available/stealth-vpn /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
DOMAIN=vpn.example.com EMAIL=you@example.com ./deploy/certbot-setup.sh
```

The certbot script issues the cert via webroot (the nginx config already serves
`/.well-known/acme-challenge/` on port 80) and installs a renewal deploy hook
that reloads nginx after every renewal.

> `deploy/nginx.conf` uses a custom `log_format` that omits query strings —
> verification/reset links carry `?token=...`, which must never land in
> `access.log`. Don't switch the site back to the default `combined` format.

## 9. Control plane — API under PM2

```bash
cd /opt/stealth-vpn/backend
pm2 start ../deploy/ecosystem.config.cjs --env production
pm2 save && pm2 startup     # survives reboots
```

`deploy/ecosystem.config.cjs` sets `kill_timeout: 10000` to match the app's
10-second graceful shutdown budget, and runs a single instance — the cron jobs
(expiry, bandwidth, snapshots, health) must never run twice, so never scale it
past `instances: 1`.

## 10. Control plane — firewall

```bash
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
```

(Node hosts additionally open `51820/udp`.)

## 11. Control plane — verify

```bash
curl -s https://<your-domain>/api/health | jq
curl -s https://<your-domain>/api/servers | jq .[].isOnline
pm2 logs stealth-vpn-backend --lines 50
```

Check the SMTP line in the boot log: `SMTP connection verified` (or a warning —
the API still runs, but mail will fail until fixed).

## 12. Smoke test

1. Register a new account → verification email arrives.
2. Add a device (basic plan) → Razorpay test checkout → config + QR delivered.
3. `wg-quick up` the config on a client → traffic flows; bandwidth ticks up in
   the dashboard after ≤5 minutes.
4. Revoke the device → tunnel dies on the node.
5. `pm2 restart stealth-vpn-backend` → API returns within seconds; 401s on the
   dashboard recover silently via refresh-token rotation.

---

## Rollback

```bash
cd /opt/stealth-vpn && git pull && cd backend && npm ci
pm2 reload stealth-vpn-backend --update-env && pm2 logs stealth-vpn-backend -f
# if the new release misbehaves:
git checkout <previous-tag> && pm2 restart stealth-vpn-backend
```

## Related

- `docs/SERVER_SETUP.md` — node provisioning in depth
- `docs/RUNBOOK.md` — day-to-day operations
- `docs/BACKUP_RESTORE.md` — backup + restore verification
- `docs/ALERTING.md` — alert channels, dedupe, cooldown
