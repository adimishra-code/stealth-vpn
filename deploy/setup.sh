#!/bin/bash
set -e

# ──────────────────────────────────────────────────────────────────────────────
# StealthVPN VPS bootstrap (control-plane host + VPN node in one).
# Run ONCE on a fresh Ubuntu 22.04/24.04 VPS as root.
# Installs: WireGuard, Xray-core, Node.js 20, Python 3, MongoDB, UFW.
# Creates wg0 + xray config from env values.
# Does NOT start the Node app — that is PM2's job (deploy/ecosystem.config.cjs),
# documented separately.
# ──────────────────────────────────────────────────────────────────────────────

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must be run as root." >&2
  exit 1
fi

# ── Load env ──────────────────────────────────────────────────────────────────
# Source backend/.env if present (values below are only defaults).
if [[ -f /srv/stealthvpn/backend/.env ]]; then
  set -a; source /srv/stealthvpn/backend/.env; set +a
fi

WG_INTERFACE="${WG_INTERFACE:-wg0}"
WG_SERVER_PUBLIC_IP="${WG_SERVER_PUBLIC_IP:?WG_SERVER_PUBLIC_IP is required}"
WG_SERVER_PUBLIC_KEY="${WG_SERVER_PUBLIC_KEY:?WG_SERVER_PUBLIC_KEY is required}"
WG_IP_POOL="${WG_IP_POOL:-10.8.0.0/24}"
WG_LISTEN_PORT="${WG_LISTEN_PORT:-51820}"
XRAY_API_PORT="${XRAY_API_PORT:-10085}"
XRAY_SNI_DEST="${XRAY_SNI_DEST:-microsoft.com}"
# MongoDB auth (INFRA-01): the database must never run without authentication.
# Use alphanumeric passwords — special chars would need URI escaping.
MONGO_ADMIN_PASSWORD="${MONGO_ADMIN_PASSWORD:?MONGO_ADMIN_PASSWORD is required}"
MONGO_APP_PASSWORD="${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}"

log()  { echo -e "\033[1;32m[INFO]\033[0m $1"; }

# ── 1. Base packages ──────────────────────────────────────────────────────────
log "Installing base packages (wireguard, python3, ufw, curl)..."
apt update -y && apt upgrade -y
DEBIAN_FRONTEND=noninteractive apt install -y \
  wireguard wireguard-tools \
  python3 python3-pip python3-qrcode \
  curl wget unzip gnupg lsb-release ca-certificates \
  ufw fail2ban openssl

# qrcode python module is used by tooling/scripts; verify availability
python3 -c "import qrcode, subprocess; print('Python qrcode OK')" || pip3 install qrcode

# ── 2. Node.js 20 (Nodesource) ────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  log "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
log "Node: $(node -v), npm: $(npm -v)"

# ── 3. MongoDB (official repo, 7.0) ───────────────────────────────────────────
if ! command -v mongod >/dev/null 2>&1; then
  log "Installing MongoDB 7.0..."
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt update -y
  apt install -y mongodb-org
  systemctl enable mongod
  systemctl start mongod
fi

# ── 3b. MongoDB authentication (idempotent) ───────────────────────────────────
# Never run mongod with zero auth. Flow:
#   * first run: authorization is enabled in mongod.conf with no users yet, so
#     MongoDB's localhost exception lets us create the admin user;
#   * re-runs: users exist → the localhost exception is gone, creation is
#     skipped or done with credentials. Never fails the script either way.
log "Enabling MongoDB authentication..."
if ! grep -q 'authorization: enabled' /etc/mongod.conf; then
  cp /etc/mongod.conf /etc/mongod.conf.bak.$(date +%s)
  if grep -q '^#security:' /etc/mongod.conf; then
    sed -i 's/^#security:/security:\n  authorization: enabled/' /etc/mongod.conf
  else
    printf '\nsecurity:\n  authorization: enabled\n' >> /etc/mongod.conf
  fi
fi
systemctl restart mongod

log "Creating MongoDB users (localhost exception on first run)..."
mongosh --quiet admin --eval "
  try {
    if (db.getUser('stealthAdmin')) { print('admin user exists'); }
    else {
      db.createUser({ user: 'stealthAdmin', pwd: '${MONGO_ADMIN_PASSWORD}', roles: [{ role: 'root', db: 'admin' }] });
      print('admin user created');
    }
  } catch (e) { print('admin creation skipped (auth already enforced): ' + e.message); }
" || true

mongosh --quiet "mongodb://stealthAdmin:${MONGO_ADMIN_PASSWORD}@127.0.0.1:27017/admin" --eval "
  const dbApp = db.getSiblingDB('stealthvpn');
  if (dbApp.getUser('stealthApp')) { print('app user exists'); }
  else {
    dbApp.createUser({ user: 'stealthApp', pwd: '${MONGO_APP_PASSWORD}', roles: [{ role: 'readWrite', db: 'stealthvpn' }] });
    print('app user created');
  }
" || log "App user creation skipped (check MONGO_ADMIN_PASSWORD; run again after fixing it)"

log "MongoDB: $(systemctl is-active mongod) (authorization: enabled)"

# ── 4. Xray-core (pinned) ─────────────────────────────────────────────────────
if ! command -v xray >/dev/null 2>&1; then
  log "Installing Xray-core v1.8.11..."
  bash -c "$(curl -sL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" \
    @ install --version v1.8.11
fi

# ── 5. WireGuard interface ────────────────────────────────────────────────────
log "Creating /etc/wireguard/${WG_INTERFACE}.conf..."
IFACE=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
cat > "/etc/wireguard/${WG_INTERFACE}.conf" << WGCONF
[Interface]
PrivateKey = $(cat /etc/wireguard/server_private.key 2>/dev/null || echo 'PLACEHOLDER')
Address = ${WG_IP_POOL%/*}.1/${WG_IP_POOL#*/}
ListenPort = ${WG_LISTEN_PORT}

PostUp   = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT
PostUp   = iptables -A FORWARD -o ${WG_INTERFACE} -j ACCEPT
PostUp   = iptables -t nat -A POSTROUTING -o ${IFACE} -j MASQUERADE
PostUp   = iptables -A FORWARD -i ${WG_INTERFACE} -o ${WG_INTERFACE} -j DROP

PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT
PostDown = iptables -D FORWARD -o ${WG_INTERFACE} -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -o ${WG_INTERFACE} -j DROP

SaveConfig = true
WGCONF

if ! grep -q 'PLACEHOLDER' "/etc/wireguard/${WG_INTERFACE}.conf"; then
  systemctl enable "wg-quick@${WG_INTERFACE}"
  systemctl start "wg-quick@${WG_INTERFACE}"
else
  log "No existing server key found — generate one and rerun, or reuse scripts/provision-node.sh"
fi

# ── 6. Kernel hardening (IPv4/IPv6 + OS) ──────────────────────────────────────
log "Applying kernel hardening (/etc/sysctl.d/99-stealth-vpn.conf)..."
cat > /etc/sysctl.d/99-stealth-vpn.conf << SYSCTLEOF
# IPv4 forwarding (WireGuard NAT gateway)
net.ipv4.ip_forward=1

# The node has no IPv6 route or address; disable it to stop IPv6 fallback
# traffic from leaving the box (IPv6 leak prevention, INFRA-16).
net.ipv6.conf.all.disable_ipv6=1
net.ipv6.conf.default.disable_ipv6=1
net.ipv6.conf.all.forwarding=0
net.ipv6.conf.default.forwarding=0

# Anti-spoofing: strict reverse-path filtering
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1

# ICMP hardening: ignore broadcast pings, don't answer bogus errors
net.ipv4.icmp_echo_ignore_broadcasts=1
net.ipv4.icmp_ignore_bogus_error_responses=1

# Redirects are never legitimate on a single-homed VPN node
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0

# OS hardening (INFRA-17)
net.ipv4.tcp_syncookies=1
kernel.randomize_va_space=2
kernel.kptr_restrict=1
kernel.dmesg_restrict=1
kernel.sysrq=0
kernel.core_uses_pid=1
fs.protected_hardlinks=1
fs.protected_symlinks=1
SYSCTLEOF
sysctl --system >/dev/null

# ── 7. UFW ────────────────────────────────────────────────────────────────────
log "Configuring UFW..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (xray fallback)'
ufw allow 443/tcp comment 'Xray XTLS-Reality'
ufw allow "${WG_LISTEN_PORT}/udp" comment 'WireGuard'
ufw --force enable

# ── 8. Xray systemd service ───────────────────────────────────────────────────
log "Writing /usr/local/etc/xray/config.json (Reality inbound on 443)..."
REALITY_PRIVATE=$(grep 'Private key' /etc/xray/reality_keys.txt 2>/dev/null | awk '{print $3}' || true)
# Never fall back to the PRIVATE key as the public one (the private key must
# only ever appear in this node's xray config, and only on the 'prv' field).
REALITY_PUBLIC="${XRAY_PUBLIC_KEY:-$(grep 'Public key' /etc/xray/reality_keys.txt 2>/dev/null | awk '{print $3}')}"
SHORT_ID="${XRAY_SHORT_ID:-0000000000000000}"

if [[ -z "$REALITY_PRIVATE" ]]; then
  mkdir -p /etc/xray
  xray x25519 > /etc/xray/reality_keys.txt
  chmod 600 /etc/xray/reality_keys.txt
  REALITY_PRIVATE=$(grep 'Private key' /etc/xray/reality_keys.txt | awk '{print $3}')
  REALITY_PUBLIC=$(grep 'Public key' /etc/xray/reality_keys.txt | awk '{print $3}')
  log "Generated new REALITY keypair — copy the public key into NODE_<NAME>_REALITY_PUBLIC_KEY:"
  grep 'Public key' /etc/xray/reality_keys.txt
fi

if [[ -z "$REALITY_PUBLIC" ]]; then
  log "WARNING: no public key available for pbk — set XRAY_PUBLIC_KEY (or rerun after creating reality_keys.txt)"
fi

cat > /usr/local/etc/xray/config.json << XRAYEOF
{
  "log": { "loglevel": "warning" },
  "api": { "tag": "api", "services": ["HandlerService", "StatsService"] },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "tag": "vless-in",
      "settings": { "clients": [], "decryption": "none", "fallbacks": [ { "dest": 80, "xver": 0 } ] },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${XRAY_SNI_DEST}:443",
          "xver": 0,
          "serverNames": ["${XRAY_SNI_DEST}", "www.${XRAY_SNI_DEST}"],
          "privateKey": "${REALITY_PRIVATE}",
          "shortIds": ["${SHORT_ID}"],
          "fingerprint": "chrome"
        },
        "tcpSettings": { "header": { "type": "none" } }
      },
      "sniffing": { "enabled": false }
    },
    {
      "listen": "127.0.0.1",
      "port": ${XRAY_API_PORT},
      "protocol": "dokodemo-door",
      "tag": "api-in",
      "settings": { "address": "127.0.0.1" }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct", "settings": {} },
    { "protocol": "blackhole", "tag": "block", "settings": {} }
  ],
  "routing": {
    "rules": [
      { "type": "field", "inboundTag": ["api-in"], "outboundTag": "api", "tag": "api" },
      { "type": "field", "ip": ["geoip:private"], "outboundTag": "direct" }
    ]
  },
  "stats": {},
  "policy": {
    "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } },
    "system": { "statsInboundUplink": true, "statsInboundDownlink": true }
  }
}
XRAYEOF

systemctl enable xray
systemctl start xray

# ── 9. App runtime dir + PM2 ──────────────────────────────────────────────────
log "Installing PM2 (global)..."
npm install -g pm2

# Unprivileged system user for the API process. PM2 and the Node app run as
# 'stealth' — root is only used at install time by this script.
id -u stealth >/dev/null 2>&1 || useradd -r -m -s /bin/bash stealth

mkdir -p /srv/stealthvpn/backend/logs
chown -R stealth:stealth /srv/stealthvpn

# PM2 boot-at-reboot service runs as 'stealth' (root creates the unit;
# the documented pm2 pattern is to run this as root with -u <user>).
pm2 startup systemd -u stealth --hp /home/stealth >/dev/null

# ── 10. VPN-node operator user + SSH lockdown (this host is also a node) ──────
# The API never logs in as root: it connects as 'stealthnode', which may only
# run the exact commands below via passwordless sudo (sudoers whitelist).
log "Creating node operator user 'stealthnode'..."
id -u stealthnode >/dev/null 2>&1 || useradd -r -m -s /bin/bash stealthnode

cat > /etc/sudoers.d/stealthnode << SUDOERS
# StealthVPN node commands only — no shell, no arbitrary commands.
Cmnd_Alias VPNNODE = /usr/bin/wg set wg0 *, /usr/bin/wg show *, /usr/bin/wg-quick save wg0, /usr/sbin/tc class *, /usr/sbin/tc filter *, /usr/local/bin/xray api *
stealthnode ALL=(root) NOPASSWD: VPNNODE
Defaults!VPNNODE !requiretty
SUDOERS
chmod 440 /etc/sudoers.d/stealthnode

log "Hardening SSH..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s)
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
sed -i 's/^#\?LoginGraceTime.*/LoginGraceTime 20/' /etc/ssh/sshd_config
grep -q '^AllowUsers ' /etc/ssh/sshd_config && \
  sed -i 's/^AllowUsers .*/AllowUsers stealthnode/' /etc/ssh/sshd_config || \
  echo "AllowUsers stealthnode" >> /etc/ssh/sshd_config
grep -q '^DenyUsers ' /etc/ssh/sshd_config && \
  sed -i 's/^DenyUsers .*/DenyUsers root/' /etc/ssh/sshd_config || \
  echo "DenyUsers root" >> /etc/ssh/sshd_config
systemctl restart sshd

log ""
log "═══════════════════════════════════════════════════════"
log "Bootstrap complete."
log "  WireGuard:   systemctl status wg-quick@${WG_INTERFACE}"
log "  Xray:        systemctl status xray"
log "  MongoDB:     systemctl status mongod"
log "  UFW:         ufw status (22/tcp, 80/tcp, 443/tcp, ${WG_LISTEN_PORT}/udp)"
log ""
log "Next steps (NOT done by this script):"
log "  1. Copy the repo to /srv/stealthvpn (backend/ + frontend/)"
log "  2. cd backend && npm install && cp .env.example .env && fill values"
log "  3. Start the API via PM2: pm2 start ../deploy/ecosystem.config.cjs --env production"
log "  4. Seed nodes: npm run seed"
log ""
log "SECURITY: back up the secrets NOW (docs/BACKUP_KEY_SETUP.md) —"
log "  WG_ENCRYPTION_KEY, JWT_*_SECRET, .env and the SSH keypair. If the"
log "  server dies without them, every user's WireGuard keys are lost."
log "═══════════════════════════════════════════════════════"
